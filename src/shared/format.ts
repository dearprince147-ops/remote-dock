/** Formats a byte count with binary units: `1.5 MB`. */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, exp)
  const digits = exp === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : decimals
  return `${value.toFixed(digits)} ${units[exp]}`
}

/** Transfers per second -> `12.4 MB/s` or `99.2 Mbps`. */
export function formatSpeed(bps: number, unit: 'bytes' | 'bits' = 'bytes'): string {
  if (!Number.isFinite(bps) || bps <= 0) return unit === 'bytes' ? '0 B/s' : '0 Mbps'
  if (unit === 'bytes') return `${formatBytes(bps)}/s`
  const bits = bps * 8
  if (bits >= 1_000_000_000) return `${(bits / 1_000_000_000).toFixed(2)} Gbps`
  if (bits >= 1_000_000) return `${(bits / 1_000_000).toFixed(1)} Mbps`
  return `${(bits / 1_000).toFixed(0)} Kbps`
}

/** Seconds -> `mm:ss` or `h:mm:ss`; null becomes an em dash. */
export function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** POSIX shell single-quote. Never build a remote command without it. */
export function shq(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`
}

/** Human date for list columns. */
export function formatDate(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}

/** `2024-06-01T...` style for tooltips. */
export function formatFullDate(ms: number): string {
  if (!ms) return 'Unknown'
  return new Date(ms).toLocaleString()
}

export function percent(done: number, total: number): number {
  if (!total || total <= 0) return 0
  return Math.max(0, Math.min(100, (done / total) * 100))
}
