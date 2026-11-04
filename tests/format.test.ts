import { describe, expect, it } from 'vitest'
import { formatBytes, formatEta, formatSpeed, percent, shq } from '@shared/format'

describe('formatBytes', () => {
  it('handles zero and small values', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
  })
  it('uses binary units', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB')
  })
  it('drops decimals for large values', () => {
    expect(formatBytes(123 * 1024 * 1024)).toBe('123 MB')
  })
})

describe('formatSpeed', () => {
  it('formats bytes per second', () => {
    expect(formatSpeed(0)).toBe('0 B/s')
    expect(formatSpeed(12.4 * 1024 * 1024)).toBe('12.4 MB/s')
  })
  it('formats bits per second', () => {
    expect(formatSpeed(0, 'bits')).toBe('0 Mbps')
    expect(formatSpeed(12.5 * 1024 * 1024, 'bits')).toMatch(/Mbps$/)
    expect(formatSpeed(12.5 * 1024 * 1024, 'bits')).toContain('104.9')
  })
})

describe('formatEta', () => {
  it('formats minutes and hours', () => {
    expect(formatEta(0)).toBe('00:00')
    expect(formatEta(75)).toBe('01:15')
    expect(formatEta(3671)).toBe('1:01:11')
  })
  it('handles unknown values', () => {
    expect(formatEta(null)).toBe('—')
    expect(formatEta(undefined)).toBe('—')
    expect(formatEta(-1)).toBe('—')
  })
})

describe('shq', () => {
  it('wraps paths in single quotes', () => {
    expect(shq('/sdcard/Movies')).toBe(`'/sdcard/Movies'`)
  })
  it('escapes embedded single quotes', () => {
    expect(shq("/sdcard/it's here")).toBe(`'/sdcard/it'\\''s here'`)
  })
})

describe('percent', () => {
  it('clamps to 0..100', () => {
    expect(percent(5, 10)).toBe(50)
    expect(percent(20, 10)).toBe(100)
    expect(percent(1, 0)).toBe(0)
  })
})
