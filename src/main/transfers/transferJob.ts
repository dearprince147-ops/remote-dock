import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import type { Settings, Transfer, TransferStatus } from '@shared/types'
import type { FileProvider } from '../devices/provider'
import { Meter, type TokenBucket } from './meter'

export interface TransferContext {
  provider: FileProvider
  settings: Settings
  signal: AbortSignal
  throttle?: TokenBucket
  onProgress: (doneBytes: number, speedBps: number, etaSec: number | null) => void
  onStatus: (status: TransferStatus) => void
}

export function localPartialPath(job: Transfer): string {
  return `${job.localPath}.part`
}

export function remotePartialPath(job: Transfer): string {
  return `${job.remotePath}.part`
}

export function partialPath(job: Transfer): string {
  return job.direction === 'download' ? localPartialPath(job) : remotePartialPath(job)
}

export async function deletePartial(job: Transfer, provider: FileProvider | null): Promise<void> {
  if (job.direction === 'download') {
    await fsp.rm(localPartialPath(job), { force: true })
    return
  }
  if (provider) await provider.remove(remotePartialPath(job), false)
}

async function fileSize(target: string): Promise<number> {
  try {
    const stat = await fsp.stat(target)
    return stat.size
  } catch {
    return 0
  }
}

export async function hashFile(target: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = fs.createReadStream(target)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function existsLocal(target: string): Promise<boolean> {
  try {
    await fsp.access(target)
    return true
  } catch {
    return false
  }
}

async function existsRemote(provider: FileProvider, target: string): Promise<boolean> {
  return (await provider.size(target)) !== null
}

function withSuffix(target: string, index: number, mode: 'win32' | 'posix'): string {
  const impl = mode === 'win32' ? path.win32 : path.posix
  const ext = impl.extname(target)
  const base = impl.basename(target, ext)
  return impl.join(impl.dirname(target), `${base} (${index})${ext}`)
}

async function uniqueTarget(
  target: string,
  mode: 'win32' | 'posix',
  exists: (candidate: string) => Promise<boolean>
): Promise<string> {
  if (!(await exists(target))) return target
  for (let i = 1; i < 10_000; i++) {
    const candidate = withSuffix(target, i, mode)
    if (!(await exists(candidate))) return candidate
  }
  throw new Error('Could not find a free file name')
}

export async function resolveTarget(job: Transfer, ctx: TransferContext): Promise<string | null> {
  const isDownload = job.direction === 'download'
  const target = isDownload ? job.localPath : job.remotePath
  const exists = (candidate: string): Promise<boolean> =>
    isDownload ? existsLocal(candidate) : existsRemote(ctx.provider, candidate)
  if (!(await exists(target))) return target
  if (ctx.settings.conflictPolicy === 'overwrite') return target
  if (ctx.settings.conflictPolicy === 'skip') return null
  return uniqueTarget(target, isDownload ? 'win32' : 'posix', exists)
}

/**
 * Runs or resumes one transfer. The `.part` file's own size is the only resume offset,
 * and the final path is not touched until the size/hash check passes.
 */
export async function runTransferJob(job: Transfer, ctx: TransferContext): Promise<void> {
  const isDownload = job.direction === 'download'
  const part = partialPath(job)

  // 1. Source identity + change detection.
  let sourceSize: number
  let sourceMtime: number
  if (isDownload) {
    const remote = await ctx.provider.stat(job.remotePath)
    if (!remote) throw new Error('Source no longer exists')
    if (remote.isDir) throw new Error('Source is a folder')
    sourceSize = remote.size
    sourceMtime = remote.mtime
  } else {
    const local = await fsp.stat(job.localPath).catch(() => null)
    if (!local) throw new Error('Source no longer exists')
    if (local.isDirectory()) throw new Error('Source is a folder')
    sourceSize = local.size
    sourceMtime = local.mtimeMs
  }

  const changed =
    job.sourceSize !== undefined &&
    (job.sourceSize !== sourceSize || Math.abs((job.sourceMtime ?? 0) - sourceMtime) > 2000)
  if (changed) await deletePartial(job, ctx.provider)

  job.sourceSize = sourceSize
  job.sourceMtime = sourceMtime
  job.totalBytes = sourceSize
  ctx.signal.throwIfAborted()

  // 2. Offset from the partial file.
  let partialSize = isDownload ? await fileSize(part) : ((await ctx.provider.size(part)) ?? 0)
  if (partialSize > sourceSize) {
    await deletePartial(job, ctx.provider)
    partialSize = 0
  }
  const offset = partialSize
  job.doneBytes = offset
  ctx.onProgress(offset, 0, null)

  // 3. Stream the remaining bytes (or create the empty file).
  if (sourceSize === 0) {
    if (isDownload) {
      if (offset === 0) await fsp.writeFile(part, Buffer.alloc(0))
    } else {
      const writable = await ctx.provider.openWrite(part, offset)
      await new Promise<void>((resolve, reject) => {
        writable.once('error', reject)
        writable.end(() => resolve())
      })
    }
  } else if (offset < sourceSize) {
    const readable = isDownload
      ? await ctx.provider.openRead(job.remotePath, offset)
      : fs.createReadStream(job.localPath, { start: offset })
    const writable = isDownload
      ? fs.createWriteStream(part, { flags: offset > 0 ? 'r+' : 'w', start: offset })
      : await ctx.provider.openWrite(part, offset)
    const meter = new Meter({
      totalBytes: sourceSize,
      offset,
      throttle: ctx.throttle,
      signal: ctx.signal,
      onSample: (sample) => ctx.onProgress(sample.doneBytes, sample.speedBps, sample.etaSec)
    })
    await pipeline(readable, meter, writable, { signal: ctx.signal })
    job.doneBytes = sourceSize
    job.speedBps = 0
    job.etaSec = null
    ctx.onProgress(sourceSize, 0, null)
  }

  ctx.signal.throwIfAborted()

  // 4. Verify the completed partial file.
  ctx.onStatus('verifying')
  const finalSize = isDownload ? await fileSize(part) : ((await ctx.provider.size(part)) ?? -1)
  if (finalSize !== sourceSize) {
    throw new Error(`Size mismatch after transfer (expected ${sourceSize}, got ${finalSize})`)
  }

  if (ctx.settings.verifyHash) {
    const sourceHash = isDownload ? await ctx.provider.sha256(job.remotePath) : await hashFile(job.localPath)
    const partHash = isDownload ? await hashFile(part) : await ctx.provider.sha256(part)
    if (sourceHash && partHash && sourceHash !== partHash) {
      await deletePartial(job, ctx.provider)
      throw new Error('Checksum mismatch — the partial file was discarded')
    }
  }

  ctx.signal.throwIfAborted()

  // 5. Commit atomically, honoring the conflict policy.
  const target = await resolveTarget(job, ctx)
  if (!target) {
    await deletePartial(job, ctx.provider)
    job.doneBytes = 0
    job.error = 'Skipped — target already exists'
    return
  }
  ctx.signal.throwIfAborted()
  if (isDownload) {
    await fsp.mkdir(path.dirname(target), { recursive: true })
    if (ctx.settings.conflictPolicy === 'overwrite') await fsp.rm(target, { force: true })
    await fsp.rename(part, target)
    job.localPath = target
  } else {
    await ctx.provider.rename(part, target)
    job.remotePath = target
  }
  job.doneBytes = job.totalBytes
}
