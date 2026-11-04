import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { Writable, type Readable } from 'node:stream'
import type { FileEntry, QuickLink } from '@shared/types'
import { runAdb, spawnAdb } from './adbBinary'
import { parseAdbDevices, parseLsOutput, parseStatLine, type AdbDeviceInfo } from './adbParse'
import { shq } from '@shared/format'
import type { FileProvider } from './provider'

export class AdbProvider implements FileProvider {
  constructor(private readonly serial: string) {}

  private shell(command: string, timeout = 20000): Promise<{ stdout: string; stderr: string; code: number }> {
    return runAdb(['-s', this.serial, 'shell', command], timeout)
  }

  async home(): Promise<{ home: string; links: QuickLink[] }> {
    return {
      home: '/sdcard',
      links: [
        { label: 'Internal storage', path: '/sdcard', icon: 'storage' },
        { label: 'Download', path: '/sdcard/Download', icon: 'download' },
        { label: 'DCIM', path: '/sdcard/DCIM', icon: 'camera' },
        { label: 'Pictures', path: '/sdcard/Pictures', icon: 'image' },
        { label: 'Movies', path: '/sdcard/Movies', icon: 'video' },
        { label: 'Music', path: '/sdcard/Music', icon: 'music' },
        { label: 'Root', path: '/', icon: 'root' }
      ]
    }
  }

  async list(dir: string): Promise<FileEntry[]> {
    const format = `%F|%s|%Y|%n`
    // `-L` is required because Android exposes the primary volume through
    // symlinks such as /sdcard -> /storage/self/primary. Without it, find only
    // reads the link itself and every shared-storage folder looks empty.
    const command = `find -L ${shq(dir)} -mindepth 1 -maxdepth 1 -exec stat -L -c '${format}' {} + 2>/dev/null`
    const result = await this.shell(command, 30000)
    const entries: FileEntry[] = []
    for (const line of result.stdout.replace(/\r\n/g, '\n').split('\n')) {
      const entry = parseStatLine(line)
      if (entry) entries.push(entry)
    }
    if (entries.length > 0) return entries
    // Appending `/.` makes ls list the target's contents (not the symlink
    // entry) on older toybox versions that lack `find -L`.
    const fallbackTarget = dir === '/' ? '/.' : `${dir.replace(/\/+$/, '')}/.`
    const fallback = await this.shell(`ls -la ${shq(fallbackTarget)} 2>/dev/null`, 30000)
    return parseLsOutput(fallback.stdout, dir)
  }

  async stat(target: string): Promise<FileEntry | null> {
    const result = await this.shell(`stat -L -c '%F|%s|%Y|%n' ${shq(target)} 2>/dev/null`)
    for (const line of result.stdout.replace(/\r\n/g, '\n').split('\n')) {
      const entry = parseStatLine(line)
      if (entry) return entry
    }
    return null
  }

  async mkdir(target: string): Promise<void> {
    const result = await this.shell(`mkdir -p ${shq(target)} 2>&1`)
    if (result.code !== 0) throw new Error(result.stdout.trim() || result.stderr.trim() || 'Could not create folder')
  }

  async rename(from: string, to: string): Promise<void> {
    const result = await this.shell(`mv -f ${shq(from)} ${shq(to)} 2>&1`)
    if (result.code !== 0) throw new Error(result.stdout.trim() || result.stderr.trim() || 'Could not rename')
  }

  async remove(target: string, isDir: boolean): Promise<void> {
    const result = await this.shell(`${isDir ? 'rm -rf' : 'rm -f'} ${shq(target)} 2>&1`)
    if (result.code !== 0) throw new Error(result.stdout.trim() || result.stderr.trim() || 'Could not delete')
  }

  async size(target: string): Promise<number | null> {
    const entry = await this.stat(target)
    return entry ? entry.size : null
  }

  async openRead(target: string, offset: number): Promise<Readable> {
    const command = offset > 0 ? `tail -c +${offset + 1} ${shq(target)}` : `cat ${shq(target)}`
    const child = spawnAdb(['-s', this.serial, 'exec-out', command])
    const stderr: string[] = []
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 50) stderr.push(chunk)
    })
    child.on('error', (error) => child.stdout.destroy(error))
    child.on('close', (code) => {
      if (code !== 0) child.stdout.destroy(new Error(stderr.join('').trim() || `adb exited with ${code}`))
    })
    child.stdout.once('close', () => {
      if (child.exitCode === null) child.kill()
    })
    return child.stdout
  }

  async openWrite(target: string, offset: number): Promise<Writable> {
    const current = await this.size(target)
    if (offset > 0) {
      if (current === null) throw new Error('Remote partial file disappeared')
      if (current > offset) await this.truncate(target, offset)
      if (current < offset) throw new Error('Remote partial file is shorter than the resume offset')
    }
    const command = offset > 0 ? `cat >> ${shq(target)}` : `cat > ${shq(target)}`
    const child: ChildProcessWithoutNullStreams = spawnAdb(['-s', this.serial, 'shell', command])
    const errors: string[] = []
    child.on('error', () => undefined)
    child.stdin.on('error', () => undefined)
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      if (errors.length < 50) errors.push(chunk)
    })
    const stdin = child.stdin
    return new Writable({
      write(chunk: Buffer, _enc, cb) {
        if (stdin.write(chunk)) cb()
        else stdin.once('drain', () => cb())
      },
      final(cb) {
        const finish = (error?: Error): void => cb(error)
        child.once('close', (code) => {
          if (code === 0) finish()
          else finish(new Error(errors.join('').trim() || `adb exited with ${code}`))
        })
        child.once('error', (error) => finish(error))
        stdin.end()
      },
      destroy(error, cb) {
        if (child.exitCode === null) child.kill()
        cb(error)
      }
    })
  }

  async truncate(target: string, size: number): Promise<void> {
    const result = await this.shell(`truncate -s ${Math.max(0, Math.floor(size))} ${shq(target)} 2>&1`)
    if (result.code === 0) return
    const fallback = await this.shell(`dd if=/dev/null of=${shq(target)} bs=1 seek=${size} 2>&1`)
    if (fallback.code !== 0) throw new Error(fallback.stdout.trim() || fallback.stderr.trim() || 'Could not truncate')
  }

  async sha256(target: string): Promise<string | null> {
    const result = await this.shell(`sha256sum ${shq(target)} 2>/dev/null`)
    const first = result.stdout.trim().split(/\s+/)[0]
    return /^[0-9a-f]{64}$/i.test(first) ? first.toLowerCase() : null
  }

  dispose(): void {
    // Per-command adb processes; nothing persistent to release.
  }
}

export class AdbTracker extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private polling = false
  private lastKey = ''

  start(): void {
    if (this.timer) return
    void this.poll()
    this.timer = setInterval(() => void this.poll(), 2000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const result = await runAdb(['devices', '-l'], 15000)
      const devices = parseAdbDevices(result.stdout)
      const key = JSON.stringify(devices)
      if (key !== this.lastKey) {
        this.lastKey = key
        this.emit('devices', devices)
      }
    } catch {
      // adb missing or server restarting; keep previous state silently.
    } finally {
      this.polling = false
    }
  }

  async connectWifi(host: string, port: number): Promise<void> {
    const target = `${host}:${port}`
    const result = await runAdb(['connect', target], 20000)
    const output = `${result.stdout}\n${result.stderr}`
    if (/connected to|already connected/i.test(output)) {
      await this.poll()
      return
    }
    throw new Error(output.trim() || `Could not connect to ${target}`)
  }

  async disconnectWifi(host: string, port: number): Promise<void> {
    try {
      await runAdb(['disconnect', `${host}:${port}`], 10000)
    } catch {
      // best effort
    }
    await this.poll()
  }
}

export function adbDeviceName(info: AdbDeviceInfo): string {
  return info.model || info.serial
}

export function adbSubtitle(info: AdbDeviceInfo): string {
  return info.model && info.model !== info.serial ? `${info.model} · ${info.serial}` : info.serial
}

export function isWifiSerial(serial: string): boolean {
  return /:\d+$/.test(serial)
}

export function adbRemotePath(dir: string, name: string): string {
  return path.posix.join(dir, name)
}
