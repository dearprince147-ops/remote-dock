import type { FileEntry } from './types'

export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'binary'

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif', 'heic', 'heif', 'tif', 'tiff'])
const VIDEO = new Set(['mp4', 'm4v', 'webm', 'ogv', 'mov', 'avi', 'mkv', '3gp', '3g2', 'ts', 'm2ts', 'flv', 'wmv'])
const AUDIO = new Set(['mp3', 'wav', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'opus', 'wma'])
const PDF = new Set(['pdf'])
const TEXT = new Set([
  'txt',
  'text',
  'md',
  'markdown',
  'log',
  'csv',
  'tsv',
  'json',
  'jsonc',
  'xml',
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'yml',
  'yaml',
  'toml',
  'ini',
  'conf',
  'cfg',
  'env',
  'sh',
  'bash',
  'zsh',
  'bat',
  'ps1',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'php',
  'sql',
  'gitignore',
  'gitattributes',
  'editorconfig',
  'properties',
  'lock'
])
const TEXT_NAMES = new Set(['dockerfile', 'makefile', 'license', 'readme', 'changelog'])
const BINARY = new Set([
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'xz',
  'bz2',
  'zst',
  'iso',
  'bin',
  'exe',
  'dll',
  'msi',
  'apk',
  'aab',
  'jar',
  'class',
  'node',
  'wasm',
  'so',
  'dylib',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'db',
  'sqlite',
  'dat'
])

export function extensionOf(name: string): string {
  const base = name.toLowerCase()
  if (!base.includes('.')) return ''
  return base.split('.').pop() ?? ''
}

export function previewKind(entry: FileEntry): PreviewKind {
  const ext = extensionOf(entry.name)
  const base = entry.name.toLowerCase()
  if (IMAGE.has(ext)) return 'image'
  if (VIDEO.has(ext)) return 'video'
  if (AUDIO.has(ext)) return 'audio'
  if (PDF.has(ext)) return 'pdf'
  if (TEXT.has(ext) || TEXT_NAMES.has(base)) return 'text'
  if (BINARY.has(ext)) return 'binary'
  return 'text'
}

export function isImageName(name: string): boolean {
  return IMAGE.has(extensionOf(name))
}

export function isVideoName(name: string): boolean {
  return VIDEO.has(extensionOf(name))
}

export function previewUrl(deviceId: string, entry: FileEntry, thumb = false): string {
  const params = new URLSearchParams({
    device: deviceId,
    path: entry.path,
    v: String(entry.mtime)
  })
  if (thumb) params.set('thumb', '1')
  return `remotedock-preview://media/?${params.toString()}`
}
