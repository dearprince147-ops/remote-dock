import { describe, expect, it } from 'vitest'
import type { FileEntry } from '@shared/types'
import { extensionOf, previewKind, previewUrl } from '@shared/preview'

function entry(name: string, path = `/sdcard/Download/${name}`): FileEntry {
  return { name, path, isDir: false, isSymlink: false, size: 1024, mtime: 1700000000000 }
}

describe('preview helpers', () => {
  it('reads extensions from names', () => {
    expect(extensionOf('photo.JPG')).toBe('jpg')
    expect(extensionOf('archive.tar.gz')).toBe('gz')
    expect(extensionOf('Dockerfile')).toBe('')
    expect(extensionOf('.gitignore')).toBe('gitignore')
  })

  it('classifies previewable files', () => {
    expect(previewKind(entry('photo.jpg'))).toBe('image')
    expect(previewKind(entry('clip.mp4'))).toBe('video')
    expect(previewKind(entry('song.mp3'))).toBe('audio')
    expect(previewKind(entry('manual.PDF'))).toBe('pdf')
    expect(previewKind(entry('README.md'))).toBe('text')
    expect(previewKind(entry('notes.log'))).toBe('text')
    expect(previewKind(entry('.gitignore'))).toBe('text')
    expect(previewKind(entry('Dockerfile'))).toBe('text')
    expect(previewKind(entry('bundle.zip'))).toBe('binary')
    expect(previewKind(entry('mystery.dat'))).toBe('binary')
    expect(previewKind(entry('unknown.xyz'))).toBe('text')
  })

  it('builds encoded preview URLs', () => {
    const file = entry('holiday photo #1.jpg', '/sdcard/DCIM/Camera/holiday photo #1.jpg')
    const url = new URL(previewUrl('adb:192.168.1.7:5050', file, true))
    expect(url.protocol).toBe('remotedock-preview:')
    expect(url.host).toBe('media')
    expect(url.searchParams.get('device')).toBe('adb:192.168.1.7:5050')
    expect(url.searchParams.get('path')).toBe('/sdcard/DCIM/Camera/holiday photo #1.jpg')
    expect(url.searchParams.get('v')).toBe('1700000000000')
    expect(url.searchParams.get('thumb')).toBe('1')
  })
})
