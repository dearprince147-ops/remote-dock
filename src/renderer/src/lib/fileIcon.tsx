import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderOpen
} from 'lucide-react'
import type { FileEntry } from '@shared/types'

const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'avif']
const VIDEO = ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', '3gp']
const AUDIO = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus']
const ARCHIVE = ['zip', 'rar', '7z', 'tar', 'gz', 'xz', 'bz2']
const CODE = ['js', 'ts', 'tsx', 'jsx', 'json', 'py', 'sh', 'css', 'html', 'xml', 'yml', 'yaml', 'toml', 'rs', 'go', 'java', 'c', 'cpp', 'h']
const TEXT = ['txt', 'md', 'log', 'conf', 'ini', 'csv']

interface FileIconProps {
  entry: FileEntry
  size?: number
  open?: boolean
}

export function FileIcon({ entry, size = 16, open = false }: FileIconProps): React.JSX.Element {
  if (entry.isDir) {
    return open ? <FolderOpen size={size} className="icon-folder" /> : <Folder size={size} className="icon-folder" />
  }
  const ext = entry.name.includes('.') ? entry.name.split('.').pop()?.toLowerCase() ?? '' : ''
  if (IMAGE.includes(ext)) return <FileImage size={size} className="icon-image" />
  if (VIDEO.includes(ext)) return <FileVideo size={size} className="icon-video" />
  if (AUDIO.includes(ext)) return <FileAudio size={size} className="icon-audio" />
  if (ARCHIVE.includes(ext)) return <FileArchive size={size} className="icon-archive" />
  if (CODE.includes(ext)) return <FileCode size={size} className="icon-code" />
  if (TEXT.includes(ext)) return <FileText size={size} className="icon-text" />
  return <File size={size} className="icon-file" />
}

export function fileTypeLabel(entry: FileEntry): string {
  if (entry.isDir) return 'Folder'
  if (entry.isSymlink) return 'Link'
  const ext = entry.name.includes('.') ? entry.name.split('.').pop()?.toUpperCase() ?? '' : ''
  return ext ? `${ext} file` : 'File'
}
