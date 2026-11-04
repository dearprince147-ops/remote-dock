import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform, Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FileEntry, Settings, Transfer } from '@shared/types'
import type { FileProvider } from '@main/devices/provider'
import { hashFile, runTransferJob, type TransferContext } from '@main/transfers/transferJob'

class FakeProvider implements FileProvider {
  readonly readOffsets: number[] = []
  readonly writeOffsets: number[] = []
  failReadAfter: number | null = null
  failWriteAfter: number | null = null
  shortReadTo: number | null = null

  constructor(readonly root: string) {}

  private local(remote: string): string {
    return path.join(this.root, remote.replace(/^\/+/, ''))
  }

  async home(): Promise<{ home: string; links: [] }> {
    return { home: '/', links: [] }
  }

  async list(remote: string): Promise<FileEntry[]> {
    const dir = this.local(remote)
    return fs.readdirSync(dir, { withFileTypes: true }).map((item) => {
      const full = path.join(dir, item.name)
      const stat = fs.statSync(full)
      return {
        name: item.name,
        path: path.posix.join(remote, item.name),
        isDir: item.isDirectory(),
        isSymlink: item.isSymbolicLink(),
        size: item.isDirectory() ? 0 : stat.size,
        mtime: stat.mtimeMs
      }
    })
  }

  async stat(remote: string): Promise<FileEntry | null> {
    try {
      const stat = fs.statSync(this.local(remote))
      return {
        name: path.posix.basename(remote),
        path: remote,
        isDir: stat.isDirectory(),
        isSymlink: false,
        size: stat.isDirectory() ? 0 : stat.size,
        mtime: stat.mtimeMs
      }
    } catch {
      return null
    }
  }

  async mkdir(remote: string): Promise<void> {
    await fsp.mkdir(this.local(remote), { recursive: true })
  }

  async rename(from: string, to: string): Promise<void> {
    const target = this.local(to)
    await fsp.mkdir(path.dirname(target), { recursive: true })
    await fsp.rm(target, { force: true, recursive: true })
    await fsp.rename(this.local(from), target)
  }

  async remove(remote: string, isDir: boolean): Promise<void> {
    await fsp.rm(this.local(remote), { force: true, recursive: isDir })
  }

  async size(remote: string): Promise<number | null> {
    try {
      return fs.statSync(this.local(remote)).size
    } catch {
      return null
    }
  }

  async openRead(remote: string, offset: number): Promise<Readable> {
    this.readOffsets.push(offset)
    const options: { start: number; end?: number } = { start: offset }
    if (this.shortReadTo !== null) options.end = offset + this.shortReadTo - 1
    const source = fs.createReadStream(this.local(remote), options)
    if (this.failReadAfter === null) return source
    const limit = this.failReadAfter
    let emitted = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _enc, callback) {
        if (emitted + chunk.length > limit) {
          const keep = limit - emitted
          if (keep > 0) this.push(chunk.subarray(0, keep))
          emitted += keep
          callback(new Error('simulated read drop'))
          return
        }
        emitted += chunk.length
        this.push(chunk)
        callback()
      }
    })
    source.pipe(limiter)
    limiter.on('close', () => source.destroy())
    return limiter
  }

  async openWrite(remote: string, offset: number): Promise<Writable> {
    this.writeOffsets.push(offset)
    const target = this.local(remote)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    if (offset > 0) {
      const current = fs.statSync(target).size
      if (current < offset) throw new Error('partial shorter than offset')
      if (current > offset) fs.truncateSync(target, offset)
    }
    const fd = fs.openSync(target, offset > 0 ? 'r+' : 'w')
    if (offset > 0) fs.ftruncateSync(fd, offset)
    let written = 0
    let closed = false
    const failAt = this.failWriteAfter
    const close = (): void => {
      if (closed) return
      closed = true
      try {
        fs.closeSync(fd)
      } catch {
        // already closed
      }
    }
    return new Writable({
      write(chunk: Buffer, _enc, callback) {
        if (failAt !== null && written + chunk.length > failAt) {
          const keep = failAt - written
          if (keep > 0) fs.writeSync(fd, chunk, 0, keep, offset + written)
          written += keep
          close()
          callback(new Error('simulated write drop'))
          return
        }
        fs.writeSync(fd, chunk, 0, chunk.length, offset + written)
        written += chunk.length
        callback()
      },
      final(callback) {
        close()
        callback()
      },
      destroy(error, callback) {
        close()
        callback(error)
      }
    })
  }

  async truncate(remote: string, size: number): Promise<void> {
    fs.truncateSync(this.local(remote), size)
  }

  async sha256(remote: string): Promise<string | null> {
    try {
      return await hashFile(this.local(remote))
    } catch {
      return null
    }
  }

  dispose(): void {
    // no-op
  }
}

const settings: Settings = {
  accent: '#22c55e',
  startFullscreen: false,
  downloadDir: '',
  maxConcurrentTransfers: 2,
  conflictPolicy: 'rename',
  autoReconnect: true,
  reconnectMaxAttempts: 10,
  verifyHash: false,
  bandwidthLimitKBps: 0,
  showHidden: false,
  confirmDelete: true,
  defaultSshPort: 22,
  adbPathOverride: '',
  view: 'list',
  sortBy: 'name',
  sortDir: 'asc',
  speedUnit: 'bytes'
}

let temp: string
let provider: FakeProvider

function job(overrides: Partial<Transfer>): Transfer {
  return {
    id: 'job',
    deviceId: 'adb:test',
    deviceName: 'Test',
    direction: 'download',
    name: 'file.bin',
    localPath: path.join(temp, 'local', 'file.bin'),
    remotePath: '/file.bin',
    totalBytes: 0,
    doneBytes: 0,
    status: 'running',
    speedBps: 0,
    etaSec: null,
    createdAt: Date.now(),
    ...overrides
  }
}

function context(controller = new AbortController()): TransferContext {
  return {
    provider,
    settings,
    signal: controller.signal,
    onProgress: () => undefined,
    onStatus: () => undefined
  }
}

function writeRemote(remote: string, data: Buffer): void {
  const target = path.join(temp, 'remote', remote.replace(/^\/+/, ''))
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, data)
}

function remotePath(remote: string): string {
  return path.join(temp, 'remote', remote.replace(/^\/+/, ''))
}

beforeEach(() => {
  temp = fs.mkdtempSync(path.join(process.env.TEMP ?? process.cwd(), 'remotedock-test-'))
  provider = new FakeProvider(path.join(temp, 'remote'))
  fs.mkdirSync(path.join(temp, 'remote'), { recursive: true })
  fs.mkdirSync(path.join(temp, 'local'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(temp, { recursive: true, force: true })
})

describe('transfer resume', () => {
  it('resumes a download after an interruption and keeps the hash intact', async () => {
    const data = Buffer.alloc(1024 * 1024)
    for (let i = 0; i < data.length; i++) data[i] = i % 251
    writeRemote('/file.bin', data)
    const sourceHash = await hashFile(remotePath('/file.bin'))

    const target = job({ direction: 'download', remotePath: '/file.bin' })
    provider.failReadAfter = 400_000
    await expect(runTransferJob(target, context())).rejects.toThrow(/simulated/)
    expect(fs.existsSync(target.localPath)).toBe(false)
    const partialSize = fs.statSync(`${target.localPath}.part`).size
    expect(partialSize).toBeGreaterThan(300_000)
    expect(partialSize).toBeLessThan(data.length)

    provider.failReadAfter = null
    await runTransferJob(target, context())
    expect(await hashFile(target.localPath)).toBe(sourceHash)
    expect(fs.existsSync(`${target.localPath}.part`)).toBe(false)
  })

  it('resumes an upload after an interruption and keeps the hash intact', async () => {
    const data = Buffer.alloc(1024 * 1024, 7)
    const local = path.join(temp, 'local', 'upload.bin')
    fs.writeFileSync(local, data)
    writeRemote('/upload.bin.part', Buffer.alloc(0))

    const target = job({
      direction: 'upload',
      localPath: local,
      remotePath: '/upload.bin',
      name: 'upload.bin'
    })
    provider.failWriteAfter = 700_000
    await expect(runTransferJob(target, context())).rejects.toThrow(/simulated/)
    expect(fs.statSync(remotePath('/upload.bin.part')).size).toBe(700_000)
    expect(fs.existsSync(remotePath('/upload.bin'))).toBe(false)

    provider.failWriteAfter = null
    await runTransferJob(target, context())
    expect(await hashFile(remotePath('/upload.bin'))).toBe(await hashFile(local))
    expect(fs.existsSync(remotePath('/upload.bin.part'))).toBe(false)
  })

  it('discards the partial file when the source changed between pause and resume', async () => {
    const first = Buffer.alloc(1024 * 1024, 1)
    writeRemote('/file.bin', first)
    const firstTime = fs.statSync(remotePath('/file.bin')).mtimeMs
    const target = job({ direction: 'download', remotePath: '/file.bin' })

    provider.failReadAfter = 400_000
    await expect(runTransferJob(target, context())).rejects.toThrow(/simulated/)

    const second = Buffer.alloc(1200 * 1000, 2)
    fs.writeFileSync(remotePath('/file.bin'), second)
    fs.utimesSync(remotePath('/file.bin'), new Date(firstTime + 5000), new Date(firstTime + 5000))

    provider.failReadAfter = null
    provider.readOffsets.length = 0
    await runTransferJob(target, context())
    expect(provider.readOffsets[0]).toBe(0)
    expect(await hashFile(target.localPath)).toBe(await hashFile(remotePath('/file.bin')))
  })

  it('discards a partial file that is larger than the source', async () => {
    const data = Buffer.alloc(1000, 3)
    writeRemote('/file.bin', data)
    const target = job({ direction: 'download', remotePath: '/file.bin' })
    fs.writeFileSync(`${target.localPath}.part`, Buffer.alloc(5000, 9))
    target.sourceSize = 1000
    target.sourceMtime = fs.statSync(remotePath('/file.bin')).mtimeMs

    await runTransferJob(target, context())
    expect(provider.readOffsets[0]).toBe(0)
    expect(fs.statSync(target.localPath).size).toBe(1000)
    expect(await hashFile(target.localPath)).toBe(await hashFile(remotePath('/file.bin')))
  })

  it('never exposes the final path when verification fails', async () => {
    const data = Buffer.alloc(1000, 4)
    writeRemote('/file.bin', data)
    const target = job({ direction: 'download', remotePath: '/file.bin' })
    provider.shortReadTo = 400

    await expect(runTransferJob(target, context())).rejects.toThrow(/Size mismatch/)
    expect(fs.existsSync(target.localPath)).toBe(false)
    expect(fs.statSync(`${target.localPath}.part`).size).toBe(400)
  })
})
