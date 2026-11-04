import type { RemoteDockApi } from '@shared/api'

export const api: RemoteDockApi = window.api

/** Turns Electron's "Error invoking remote method 'x': Error: real" into "real". */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const match = /Error invoking remote method '[^']+':\s*(?:Error:\s*)?(.*)$/s.exec(raw)
  if (match) return match[1].trim()
  return raw.replace(/^Error:\s*/i, '').trim() || 'Something went wrong'
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
