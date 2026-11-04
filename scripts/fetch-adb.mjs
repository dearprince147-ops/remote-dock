// Fetches adb.exe + Windows DLLs into resources/adb.
// Strategy: copy from an existing platform-tools install on PATH first (fast, offline),
// otherwise download Google's platform-tools zip. Never fails `npm install`.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const targetDir = path.join(root, 'resources', 'adb')
const target = path.join(targetDir, 'adb.exe')
const wanted = ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll']

if (existsSync(target) && wanted.every((f) => existsSync(path.join(targetDir, f)))) {
  console.log('[fetch-adb] resources/adb already present')
  process.exit(0)
}

mkdirSync(targetDir, { recursive: true })

function findOnPath() {
  try {
    const out = execFileSync('where.exe', ['adb'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const first = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0]
    return first && existsSync(first) ? first : null
  } catch {
    return null
  }
}

function copyFrom(dir, allowPartial) {
  let copied = 0
  for (const file of wanted) {
    const src = path.join(dir, file)
    if (existsSync(src)) {
      copyFileSync(src, path.join(targetDir, file))
      copied++
    }
  }
  if (!allowPartial && copied !== wanted.length) return false
  return copied > 0
}

const local = findOnPath()
if (local) {
  const dir = path.dirname(local)
  if (copyFrom(dir, false)) {
    console.log(`[fetch-adb] copied platform-tools from ${dir}`)
    process.exit(0)
  }
  console.log('[fetch-adb] local platform-tools found but DLLs are missing, downloading instead')
}

const url = 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip'
let temp
try {
  console.log('[fetch-adb] downloading platform-tools…')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  temp = mkdtempSync(path.join(tmpdir(), 'remotedock-adb-'))
  const zip = path.join(temp, 'platform-tools.zip')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(zip, buf)
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${temp}' -Force`],
    { stdio: 'inherit' }
  )
  const extracted = path.join(temp, 'platform-tools')
  if (!copyFrom(extracted, false)) throw new Error('archive did not contain the expected adb files')
  console.log('[fetch-adb] installed resources/adb')
} catch (error) {
  console.warn('[fetch-adb] could not bundle adb:', error instanceof Error ? error.message : error)
  console.warn('[fetch-adb] RemoteDock will fall back to the adb on PATH. To bundle it manually, copy')
  console.warn('[fetch-adb] adb.exe, AdbWinApi.dll and AdbWinUsbApi.dll into resources/adb/.')
} finally {
  if (temp) rmSync(temp, { recursive: true, force: true })
}
