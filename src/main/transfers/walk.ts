import fs from 'node:fs/promises'
import path from 'node:path'
import type { FileProvider } from '../devices/provider'

export interface WalkedFile {
  path: string
  rel: string
  size: number
  mtime: number
}

export interface WalkedTree {
  dirs: string[]
  files: WalkedFile[]
}

const MAX_ENTRIES = 200_000

/** Recursively lists a remote folder. Symlinks to folders are skipped to avoid loops. */
export async function walkRemote(provider: FileProvider, root: string): Promise<WalkedTree> {
  const dirs: string[] = []
  const files: WalkedFile[] = []
  const queue: Array<{ dir: string; rel: string }> = [{ dir: root, rel: '' }]
  let seen = 0

  while (queue.length) {
    const current = queue.shift()
    if (!current) break
    const entries = await provider.list(current.dir)
    for (const entry of entries) {
      if (++seen > MAX_ENTRIES) throw new Error('Folder contains too many entries')
      const rel = current.rel ? path.posix.join(current.rel, entry.name) : entry.name
      if (entry.isDir) {
        if (entry.isSymlink) continue
        dirs.push(rel)
        queue.push({ dir: entry.path, rel })
      } else {
        files.push({ path: entry.path, rel, size: entry.size, mtime: entry.mtime })
      }
    }
  }
  return { dirs, files }
}

/** Recursively lists a local folder. Symlinks to folders are skipped. */
export async function walkLocal(root: string): Promise<WalkedTree> {
  const dirs: string[] = []
  const files: WalkedFile[] = []
  const queue: Array<{ dir: string; rel: string }> = [{ dir: root, rel: '' }]
  let seen = 0

  while (queue.length) {
    const current = queue.shift()
    if (!current) break
    const entries = await fs.readdir(current.dir, { withFileTypes: true })
    for (const entry of entries) {
      if (++seen > MAX_ENTRIES) throw new Error('Folder contains too many entries')
      const full = path.join(current.dir, entry.name)
      const rel = current.rel ? path.posix.join(current.rel, entry.name) : entry.name
      if (entry.isDirectory()) {
        dirs.push(rel)
        queue.push({ dir: full, rel })
      } else if (entry.isSymbolicLink()) {
        const stat = await fs.stat(full).catch(() => null)
        if (!stat || stat.isDirectory()) continue
        files.push({ path: full, rel, size: stat.size, mtime: stat.mtimeMs })
      } else if (entry.isFile()) {
        const stat = await fs.stat(full)
        files.push({ path: full, rel, size: stat.size, mtime: stat.mtimeMs })
      }
    }
  }
  return { dirs, files }
}
