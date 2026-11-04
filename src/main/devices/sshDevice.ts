import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { Readable, Writable } from 'node:stream'
import { Client, type ConnectConfig, type SFTPWrapper, type Stats } from 'ssh2'
import type { FileEntry, QuickLink } from '@shared/types'
import { shq } from '@shared/format'
import { peekHost, primeHosts } from './hostKeys'
import type { FileProvider } from './provider'

function expandPath(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1))
  }
  return p
}

export class HostKeyUnknownError extends Error {
  constructor(
    readonly host: string,
    readonly port: number,
    readonly fingerprint: string
  ) {
    super('The host key is not trusted yet')
    this.name = 'HostKeyUnknownError'
  }
}

export class HostKeyChangedError extends Error {
  constructor(readonly fingerprint: string) {
    super('Host key changed — possible tampering. Remove it in Settings > Known hosts to continue.')
    this.name = 'HostKeyChangedError'
  }
}

function call<T>(fn: (cb: (err: Error | null | undefined, result: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    fn((err, result) => (err ? reject(err) : resolve(result)))
  })
}

function callVoid(fn: (cb: (err?: Error | null) => void) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    fn((err) => (err ? reject(err) : resolve()))
  })
}

function toEntry(filename: string, dir: string, attrs: Stats): FileEntry {
  return {
    name: filename,
    path: path.posix.join(dir, filename),
    isDir: attrs.isDirectory(),
    isSymlink: attrs.isSymbolicLink(),
    size: attrs.isDirectory() ? 0 : attrs.size,
    mtime: (attrs.mtime ?? 0) * 1000,
    mode: attrs.mode ? modeString(attrs.mode) : undefined
  }
}

function modeString(mode: number): string {
  const chars = 'rwxrwxrwx'
  let out = ''
  for (let i = 0; i < 9; i++) out += mode & (1 << (8 - i)) ? chars[i] : '-'
  return out
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

export interface SshDeviceOptions {
  host: string
  port: number
  username: string
  auth: 'password' | 'key'
  password?: string
  privateKeyPath?: string
  passphrase?: string
}

export class SshDevice extends EventEmitter implements FileProvider {
  private client: Client | null = null
  private sftp: SFTPWrapper | null = null
  private hostKeyError: HostKeyUnknownError | HostKeyChangedError | null = null
  private closing = false

  constructor(private readonly options: SshDeviceOptions) {
    super()
  }

  async connect(): Promise<void> {
    await primeHosts()
    const config = await this.buildConfig()
    this.hostKeyError = null
    this.closing = false
    const client = new Client()
    this.client = client

    client.on('error', (error) => {
      if (!this.closing) this.emit('lost', error)
    })
    client.on('close', () => {
      if (!this.closing) this.emit('lost', new Error('Connection closed'))
    })

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const fail = (error: unknown): void => {
        if (settled) return
        settled = true
        reject(this.hostKeyError ?? (error instanceof Error ? error : new Error(String(error))))
      }
      client.once('ready', () => {
        if (settled) return
        settled = true
        resolve()
      })
      client.once('error', fail)
      client.once('close', () => fail(new Error('Connection closed')))
      try {
        client.connect(config)
      } catch (error) {
        fail(error)
      }
    })

    this.sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)))
    })
  }

  private async buildConfig(): Promise<ConnectConfig> {
    const o = this.options
    const config: ConnectConfig = {
      host: o.host,
      port: o.port,
      username: o.username,
      readyTimeout: 15000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
      hostHash: 'sha256',
      hostVerifier: (hash: string) => {
        const raw = /^[0-9a-f]{64}$/i.test(hash) ? Buffer.from(hash, 'hex').toString('base64') : hash
        const fingerprint = `SHA256:${raw}`
        const record = peekHost(o.host, o.port)
        if (!record) {
          this.hostKeyError = new HostKeyUnknownError(o.host, o.port, fingerprint)
          return false
        }
        if (record.fingerprint !== fingerprint) {
          this.hostKeyError = new HostKeyChangedError(fingerprint)
          return false
        }
        return true
      }
    }
    if (o.auth === 'password') {
      config.password = o.password ?? ''
    } else {
      if (!o.privateKeyPath) throw new Error('Choose a private key file')
      const keyPath = expandPath(o.privateKeyPath)
      config.privateKey = await fs.readFile(keyPath)
      if (o.passphrase) config.passphrase = o.passphrase
    }
    return config
  }

  private sftpOrThrow(): SFTPWrapper {
    if (!this.sftp) throw new Error('SFTP session is not connected')
    return this.sftp
  }

  async home(): Promise<{ home: string; links: QuickLink[] }> {
    const home = await call<string>((cb) => this.sftpOrThrow().realpath('.', cb))
    return {
      home,
      links: [
        { label: 'Home', path: home, icon: 'home' },
        { label: 'Root', path: '/', icon: 'root' }
      ]
    }
  }

  async list(dir: string): Promise<FileEntry[]> {
    const sftp = this.sftpOrThrow()
    const raw = await call<Array<{ filename: string; attrs: Stats }>>((cb) => sftp.readdir(dir, cb))
    const entries = raw
      .filter((item) => item.filename !== '.' && item.filename !== '..')
      .map((item) => toEntry(item.filename, dir, item.attrs))

    const symlinks = entries.filter((entry) => entry.isSymlink)
    if (symlinks.length) {
      await mapLimit(symlinks, 8, async (entry) => {
        try {
          const target = await call<Stats>((cb) => sftp.stat(entry.path, cb))
          if (target.isDirectory()) {
            entry.isDir = true
            entry.size = 0
          } else {
            entry.size = target.size
            entry.mtime = (target.mtime ?? 0) * 1000 || entry.mtime
          }
        } catch {
          entry.isDir = false
        }
        return entry
      })
    }
    return entries
  }

  async stat(target: string): Promise<FileEntry | null> {
    try {
      const attrs = await call<Stats>((cb) => this.sftpOrThrow().stat(target, cb))
      return toEntry(path.posix.basename(target), path.posix.dirname(target), attrs)
    } catch {
      return null
    }
  }

  async mkdir(target: string): Promise<void> {
    try {
      await callVoid((cb) => this.sftpOrThrow().mkdir(target, cb))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/already exists/i.test(message)) throw error
    }
  }

  async rename(from: string, to: string): Promise<void> {
    const sftp = this.sftpOrThrow()
    const ext = (sftp as unknown as { ext_openssh_rename?: (a: string, b: string, cb: (e?: Error | null) => void) => void })
      .ext_openssh_rename
    if (typeof ext === 'function') {
      try {
        await callVoid((cb) => ext.call(sftp, from, to, cb))
        return
      } catch {
        // fall through to unlink+rename
      }
    }
    try {
      await callVoid((cb) => sftp.unlink(to, cb))
    } catch {
      // target does not exist
    }
    await callVoid((cb) => sftp.rename(from, to, cb))
  }

  async remove(target: string, isDir: boolean): Promise<void> {
    const sftp = this.sftpOrThrow()
    if (!isDir) {
      await callVoid((cb) => sftp.unlink(target, cb))
      return
    }
    const children = await call<Array<{ filename: string; attrs: Stats }>>((cb) => sftp.readdir(target, cb))
    for (const child of children) {
      if (child.filename === '.' || child.filename === '..') continue
      const childPath = path.posix.join(target, child.filename)
      const childDir = child.attrs.isDirectory() && !child.attrs.isSymbolicLink()
      await this.remove(childPath, childDir)
    }
    await callVoid((cb) => sftp.rmdir(target, cb))
  }

  async size(target: string): Promise<number | null> {
    const entry = await this.stat(target)
    return entry ? entry.size : null
  }

  async openRead(target: string, offset: number): Promise<Readable> {
    return this.sftpOrThrow().createReadStream(target, { start: offset, highWaterMark: 256 * 1024 })
  }

  async openWrite(target: string, offset: number): Promise<Writable> {
    return this.sftpOrThrow().createWriteStream(target, {
      flags: offset > 0 ? 'r+' : 'w',
      start: offset,
      highWaterMark: 256 * 1024
    })
  }

  async truncate(target: string, size: number): Promise<void> {
    const sftp = this.sftpOrThrow()
    try {
      const handle = await call<Buffer>((cb) => sftp.open(target, 'r+', cb))
      try {
        const withTruncate = sftp as unknown as {
          ftruncate?: (fd: Buffer, len: number, cb: (err?: Error | null) => void) => void
        }
        if (typeof withTruncate.ftruncate === 'function') {
          await callVoid((cb) => withTruncate.ftruncate?.(handle, size, cb))
        } else {
          await callVoid((cb) => sftp.setstat(target, { size }, cb))
        }
      } finally {
        await callVoid((cb) => sftp.close(handle, cb)).catch(() => undefined)
      }
    } catch {
      await callVoid((cb) => sftp.setstat(target, { size }, cb))
    }
  }

  async sha256(target: string): Promise<string | null> {
    if (!this.client) return null
    return new Promise<string | null>((resolve) => {
      this.client?.exec(`sha256sum -- ${shq(target)}`, (err, stream) => {
        if (err) return resolve(null)
        let out = ''
        stream.on('data', (chunk: Buffer) => {
          out += chunk.toString()
        })
        stream.stderr.on('data', () => undefined)
        stream.on('close', () => {
          const first = out.trim().split(/\s+/)[0]
          resolve(/^[0-9a-f]{64}$/i.test(first) ? first.toLowerCase() : null)
        })
      })
    })
  }

  dispose(): void {
    this.closing = true
    try {
      this.client?.end()
    } catch {
      // already closed
    }
    this.sftp = null
    this.client = null
  }
}
