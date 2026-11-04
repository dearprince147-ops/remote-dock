import path from 'node:path'
import type { FileEntry } from '@shared/types'

export interface AdbDeviceInfo {
  serial: string
  state: 'device' | 'unauthorized' | 'offline' | 'unknown'
  model: string
  product?: string
  transportId?: string
}

/** Parses `adb devices -l` output (whitespace separated, never tab-assumed). */
export function parseAdbDevices(output: string): AdbDeviceInfo[] {
  const result: AdbDeviceInfo[] = []
  for (const raw of output.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('List of devices') || line.startsWith('*') || line.startsWith('adb ')) continue
    const parts = line.split(/\s+/)
    if (parts.length < 2) continue
    const [serial, stateRaw] = parts
    const state =
      stateRaw === 'device' || stateRaw === 'unauthorized' || stateRaw === 'offline' ? stateRaw : 'unknown'
    const extras: Record<string, string> = {}
    for (const token of parts.slice(2)) {
      const idx = token.indexOf(':')
      if (idx > 0) extras[token.slice(0, idx)] = token.slice(idx + 1)
    }
    result.push({
      serial,
      state,
      model: (extras.model ?? '').replace(/_/g, ' ').trim() || serial,
      product: extras.product,
      transportId: extras.transport_id
    })
  }
  return result
}

function splitStatLine(line: string): [string, string, string, string] | null {
  const i1 = line.indexOf('|')
  if (i1 < 0) return null
  const i2 = line.indexOf('|', i1 + 1)
  if (i2 < 0) return null
  const i3 = line.indexOf('|', i2 + 1)
  if (i3 < 0) return null
  return [line.slice(0, i1), line.slice(i1 + 1, i2), line.slice(i2 + 1, i3), line.slice(i3 + 1)]
}

/** Parses one `stat -L -c '%F|%s|%Y|%n'` line. */
export function parseStatLine(line: string): FileEntry | null {
  const trimmed = line.replace(/\r$/, '').trimEnd()
  if (!trimmed || trimmed.startsWith('stat:') || trimmed.startsWith('find:')) return null
  const parts = splitStatLine(trimmed)
  if (!parts) return null
  const [typeRaw, sizeRaw, mtimeRaw, fullPath] = parts
  if (!fullPath) return null
  const type = typeRaw.toLowerCase()
  const isDir = type.includes('directory')
  const isSymlink = type.includes('link')
  const size = Number(sizeRaw)
  const mtime = Number(mtimeRaw)
  return {
    name: path.posix.basename(fullPath),
    path: fullPath,
    isDir,
    isSymlink,
    size: isDir || !Number.isFinite(size) ? 0 : size,
    mtime: Number.isFinite(mtime) ? mtime * 1000 : 0,
    mode: type
  }
}

const LS_RE =
  /^([dlbcps-][rwxsStT-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(?:(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})|([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}))\s+(.+)$/

/** Fallback parser for `ls -la <dir>` output on older toybox builds. */
export function parseLsOutput(output: string, dir: string): FileEntry[] {
  const result: FileEntry[] = []
  const now = new Date()
  for (const raw of output.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (!line || line.startsWith('total ')) continue
    const match = LS_RE.exec(line)
    if (!match) continue
    const [, mode, sizeRaw, year, month, day, hh, mm, monName, monDay, oldHh, oldMm, nameRaw] = match
    let name = nameRaw
    if (name === '.' || name === '..') continue
    const arrow = name.indexOf(' -> ')
    if (arrow >= 0) name = name.slice(0, arrow)
    const isDir = mode.startsWith('d')
    const isSymlink = mode.startsWith('l')
    let mtime = 0
    if (year) {
      mtime = new Date(Number(year), Number(month) - 1, Number(day), Number(hh), Number(mm)).getTime()
    } else if (monName) {
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
      const m = months.indexOf(monName.toLowerCase())
      if (m >= 0) {
        const date = new Date(now.getFullYear(), m, Number(monDay), Number(oldHh), Number(oldMm))
        if (date.getTime() > now.getTime() + 86_400_000) date.setFullYear(now.getFullYear() - 1)
        mtime = date.getTime()
      }
    }
    const size = Number(sizeRaw)
    result.push({
      name,
      path: path.posix.join(dir, name),
      isDir,
      isSymlink,
      size: isDir || !Number.isFinite(size) ? 0 : size,
      mtime,
      mode
    })
  }
  return result
}

export function parseStatOutput(output: string): FileEntry | null {
  const lines = output.replace(/\r\n/g, '\n').split('\n')
  for (const line of lines) {
    const entry = parseStatLine(line)
    if (entry) return entry
  }
  return null
}
