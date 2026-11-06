export function normalizeTextForSave(
  content: string,
  newline: 'lf' | 'crlf',
  bom: boolean
): string {
  const lf = content.replace(/\r\n/g, '\n')
  const normalized = newline === 'crlf' ? lf.replace(/\n/g, '\r\n') : lf
  return `${bom ? '\uFEFF' : ''}${normalized}`
}
