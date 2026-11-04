import type { Readable, Writable } from 'node:stream'
import type { FileEntry, QuickLink } from '@shared/types'

/**
 * Provider-agnostic remote filesystem. SSH/SFTP and ADB both implement this so the
 * transfer engine never needs to know which transport is in use.
 */
export interface FileProvider {
  home(): Promise<{ home: string; links: QuickLink[] }>
  list(path: string): Promise<FileEntry[]>
  stat(path: string): Promise<FileEntry | null>
  mkdir(path: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  remove(path: string, isDir: boolean): Promise<void>
  size(path: string): Promise<number | null>
  openRead(path: string, offset: number): Promise<Readable>
  openWrite(path: string, offset: number): Promise<Writable>
  truncate(path: string, size: number): Promise<void>
  sha256(path: string): Promise<string | null>
  dispose(): void
}
