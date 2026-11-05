import { nativeImage, protocol } from 'electron'
import { Readable } from 'node:stream'
import path from 'node:path'
import type { TextPreview } from '@shared/types'
import type { FileProvider } from './provider'

export const PREVIEW_SCHEME = 'remotedock-preview'

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff'
}

const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',
  '3g2': 'video/3gpp2',
  ts: 'video/mp2t',
  m2ts: 'video/mp2t',
  flv: 'video/x-flv',
  wmv: 'video/x-ms-wmv'
}

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  opus: 'audio/opus',
  wma: 'audio/x-ms-wma'
}

const TEXT_MIME: Record<string, string> = {
  txt: 'text/plain; charset=utf-8',
  text: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  markdown: 'text/markdown; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  tsv: 'text/tab-separated-values; charset=utf-8',
  json: 'application/json; charset=utf-8',
  jsonc: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  cjs: 'text/javascript; charset=utf-8',
  jsx: 'text/javascript; charset=utf-8',
  ts: 'text/typescript; charset=utf-8',
  tsx: 'text/typescript; charset=utf-8',
  yml: 'text/yaml; charset=utf-8',
  yaml: 'text/yaml; charset=utf-8',
  toml: 'text/plain; charset=utf-8',
  ini: 'text/plain; charset=utf-8',
  conf: 'text/plain; charset=utf-8',
  cfg: 'text/plain; charset=utf-8',
  env: 'text/plain; charset=utf-8',
  sh: 'text/x-shellscript; charset=utf-8',
  bash: 'text/x-shellscript; charset=utf-8',
  zsh: 'text/x-shellscript; charset=utf-8',
  bat: 'text/plain; charset=utf-8',
  ps1: 'text/plain; charset=utf-8',
  py: 'text/x-python; charset=utf-8',
  rb: 'text/x-ruby; charset=utf-8',
  go: 'text/x-go; charset=utf-8',
  rs: 'text/x-rust; charset=utf-8',
  java: 'text/x-java; charset=utf-8',
  c: 'text/x-c; charset=utf-8',
  h: 'text/x-c; charset=utf-8',
  cpp: 'text/x-c++; charset=utf-8',
  hpp: 'text/x-c++; charset=utf-8',
  cs: 'text/x-csharp; charset=utf-8',
  php: 'text/x-php; charset=utf-8',
  sql: 'text/x-sql; charset=utf-8',
  svg: 'text/xml; charset=utf-8',
  gitignore: 'text/plain; charset=utf-8',
  dockerfile: 'text/plain; charset=utf-8',
  makefile: 'text/plain; charset=utf-8'
}

export function mimeTypeFor(name: string): string {
  const base = path.posix.basename(name).toLowerCase()
  const ext = base.includes('.') ? base.split('.').pop() ?? '' : base
  return (
    IMAGE_MIME[ext] ??
    VIDEO_MIME[ext] ??
    AUDIO_MIME[ext] ??
    TEXT_MIME[ext] ??
    (base === 'dockerfile' || base === 'makefile' ? 'text/plain; charset=utf-8' : 'application/octet-stream')
  )
}

function isImage(name: string): boolean {
  return mimeTypeFor(name).startsWith('image/') && !name.toLowerCase().endsWith('.svg')
}

async function readPrefix(source: Readable, limit: number): Promise<{ buffer: Buffer; truncated: boolean }> {
  const chunks: Buffer[] = []
  let total = 0
  let truncated = false
  try {
    for await (const chunk of source) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      const remaining = limit - total
      if (buffer.length > remaining) {
        if (remaining > 0) chunks.push(buffer.subarray(0, remaining))
        total = limit
        truncated = true
        break
      }
      chunks.push(buffer)
      total += buffer.length
    }
  } finally {
    if (!source.destroyed) source.destroy()
  }
  return { buffer: Buffer.concat(chunks), truncated }
}

export async function readTextPreview(
  provider: FileProvider,
  target: string,
  maxBytes = 512 * 1024
): Promise<TextPreview> {
  const entry = await provider.stat(target)
  if (!entry) throw new Error('File not found on the device')
  if (entry.isDir) throw new Error('Folders cannot be previewed as text')
  const limit = Math.min(Math.max(1, Math.floor(maxBytes)), 4 * 1024 * 1024)
  const size = Math.max(0, entry.size)
  const stream = await provider.openRead(target, 0)
  const { buffer, truncated } = await readPrefix(stream, Math.min(limit, size))
  const binary = buffer.includes(0)
  let text = ''
  if (!binary) {
    text = buffer.toString('utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  }
  return {
    text,
    size,
    truncated: truncated || buffer.length < size,
    binary
  }
}

const THUMB_WIDTH = 320
const THUMB_HEIGHT = 220
const THUMB_MAX_BYTES = 32 * 1024 * 1024
const THUMB_CACHE_LIMIT = 240
const thumbCache = new Map<string, Buffer>()

function cacheThumb(key: string, data: Buffer): void {
  thumbCache.delete(key)
  thumbCache.set(key, data)
  while (thumbCache.size > THUMB_CACHE_LIMIT) {
    const oldest = thumbCache.keys().next().value
    if (oldest === undefined) break
    thumbCache.delete(oldest)
  }
}

async function thumbnailFor(
  provider: FileProvider,
  deviceId: string,
  target: string,
  size: number,
  mtime: number
): Promise<Buffer | null> {
  if (size <= 0 || size > THUMB_MAX_BYTES) return null
  const key = `${deviceId}\u0000${target}\u0000${mtime}\u0000${size}`
  const cached = thumbCache.get(key)
  if (cached) {
    thumbCache.delete(key)
    thumbCache.set(key, cached)
    return cached
  }
  try {
    const stream = await provider.openRead(target, 0)
    const { buffer, truncated } = await readPrefix(stream, size)
    if (truncated || buffer.length !== size) return null
    const image = nativeImage.createFromBuffer(buffer)
    if (image.isEmpty()) return null
    const dimensions = image.getSize()
    if (!dimensions.width || !dimensions.height) return null
    const ratio = Math.min(THUMB_WIDTH / dimensions.width, THUMB_HEIGHT / dimensions.height, 1)
    const resized =
      ratio < 1
        ? image.resize({
            width: Math.max(1, Math.round(dimensions.width * ratio)),
            height: Math.max(1, Math.round(dimensions.height * ratio)),
            quality: 'good'
          })
        : image
    const jpeg = resized.toJPEG(78)
    cacheThumb(key, jpeg)
    return jpeg
  } catch {
    return null
  }
}

function parseRange(header: string | null, size: number): { start: number; end: number } | { invalid: true } | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return { invalid: true }
  let start = rawStart ? Number(rawStart) : Number.NaN
  let end = rawEnd ? Number(rawEnd) : Number.NaN
  if (Number.isNaN(start) && !Number.isNaN(end)) {
    start = Math.max(0, size - end)
    end = size - 1
  } else if (!Number.isNaN(start) && Number.isNaN(end)) {
    end = size - 1
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start || start >= size) {
    return { invalid: true }
  }
  return { start, end: Math.min(end, size - 1) }
}

function limitedWebStream(source: Readable, length: number): ReadableStream<Uint8Array> {
  async function* generate(): AsyncGenerator<Buffer> {
    if (length <= 0) return
    let sent = 0
    for await (const chunk of source) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      const take = Math.min(buffer.length, length - sent)
      if (take > 0) {
        sent += take
        yield take === buffer.length ? buffer : buffer.subarray(0, take)
      }
      if (sent >= length) break
    }
  }
  return Readable.toWeb(Readable.from(generate())) as ReadableStream<Uint8Array>
}

function notFound(message = 'Not found'): Response {
  return new Response(message, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

export interface PreviewProviderSource {
  provider(id: string): FileProvider
}

async function handlePreview(source: PreviewProviderSource, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const deviceId = url.searchParams.get('device')
  const target = url.searchParams.get('path')
  if (!deviceId || !target) return notFound('Missing device or path')
  let provider: FileProvider
  try {
    provider = source.provider(deviceId)
  } catch {
    return notFound('Device is not connected')
  }
  const entry = await provider.stat(target)
  if (!entry || entry.isDir) return notFound('File not found')
  const mime = mimeTypeFor(entry.name || target)
  const size = Math.max(0, entry.size)
  const wantsThumb = url.searchParams.get('thumb') === '1'

  if (wantsThumb && isImage(entry.name || target)) {
    const image = await thumbnailFor(provider, deviceId, target, size, entry.mtime)
    if (!image) return notFound('No thumbnail for this image')
    return new Response(new Uint8Array(image), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(image.length),
        'Cache-Control': 'private, max-age=86400'
      }
    })
  }

  const range = parseRange(request.headers.get('range'), size)
  if (range && 'invalid' in range) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' }
    })
  }

  const start = range ? range.start : 0
  const end = range ? range.end : Math.max(0, size - 1)
  const length = size === 0 ? 0 : end - start + 1
  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=600'
  }
  if (size > 0) headers['Content-Length'] = String(length)
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`

  if (request.method === 'HEAD' || length === 0) {
    return new Response(null, { status: range ? 206 : 200, headers })
  }

  const stream = await provider.openRead(target, start)
  return new Response(limitedWebStream(stream, length), {
    status: range ? 206 : 200,
    headers
  })
}

export function registerPreviewProtocol(source: PreviewProviderSource): void {
  protocol.handle(PREVIEW_SCHEME, async (request) => {
    try {
      return await handlePreview(source, request)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return new Response(message, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }
  })
}
