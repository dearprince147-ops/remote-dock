export const ACCENT_PRESETS = [
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#eab308' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Red', value: '#ef4444' }
]

export function isHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  }
}

function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const channel = (value: number): number => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function applyAccent(hex: string): void {
  if (!isHex(hex)) return
  const { r, g, b } = hexToRgb(hex)
  const root = document.documentElement
  root.style.setProperty('--accent', hex)
  root.style.setProperty('--accent-rgb', `${r} ${g} ${b}`)
  root.style.setProperty('--accent-fg', luminance(hex) > 0.45 ? '#08120c' : '#ffffff')
}
