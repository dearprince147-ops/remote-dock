import { describe, expect, it } from 'vitest'
import { normalizeTextForSave } from '@shared/textEdit'

describe('normalizeTextForSave', () => {
  it('keeps LF line endings', () => {
    expect(normalizeTextForSave('one\ntwo\n', 'lf', false)).toBe('one\ntwo\n')
  })

  it('converts LF and mixed line endings to CRLF', () => {
    expect(normalizeTextForSave('one\ntwo\r\nthree', 'crlf', false)).toBe('one\r\ntwo\r\nthree')
  })

  it('restores a UTF-8 byte order mark', () => {
    expect(normalizeTextForSave('hello', 'lf', true)).toBe('\uFEFFhello')
  })

  it('does not duplicate existing CRLF sequences', () => {
    expect(normalizeTextForSave('one\r\ntwo', 'crlf', false)).toBe('one\r\ntwo')
  })
})
