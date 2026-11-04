// Renders build/icon.png (512x512) from an inline SVG using sharp.
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'build')
mkdirSync(buildDir, { recursive: true })

const target = path.join(buildDir, 'icon.png')
if (existsSync(target)) {
  console.log('[make-icon] build/icon.png already exists, skipping generation')
  process.exit(0)
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#161b1e"/>
      <stop offset="1" stop-color="#0b0d0e"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4ade80"/>
      <stop offset="1" stop-color="#16a34a"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#bg)" stroke="#2a3237" stroke-width="8"/>
  <rect x="104" y="128" width="304" height="176" rx="24" fill="#111416" stroke="#2f393f" stroke-width="10"/>
  <path d="M188 340h136l18 58H170l18-58z" fill="#1e2529" stroke="#2f393f" stroke-width="8" stroke-linejoin="round"/>
  <path d="M240 168v72M240 168l-34 34M240 168l34 34" stroke="url(#accent)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M196 268h120" stroke="url(#accent)" stroke-width="26" stroke-linecap="round"/>
  <circle cx="376" cy="376" r="58" fill="url(#accent)"/>
  <path d="M350 376l18 18 34-38" stroke="#04130a" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`

await sharp(Buffer.from(svg)).png().resize(512, 512).toFile(path.join(buildDir, 'icon.png'))
console.log('[make-icon] wrote build/icon.png')
