import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface AdbResult {
  code: number
  stdout: string
  stderr: string
}

let cachedPath: string | null = null

/** override -> bundled resources -> PATH. An explicit override is always honored. */
export function resolveAdbPath(override = ''): string {
  if (override) return override
  if (cachedPath && fs.existsSync(cachedPath)) return cachedPath
  const candidates: string[] = []
  if (app.isPackaged) candidates.push(path.join(process.resourcesPath, 'adb', 'adb.exe'))
  candidates.push(path.join(app.getAppPath(), 'resources', 'adb', 'adb.exe'))
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      cachedPath = candidate
      return candidate
    }
  }
  return 'adb'
}

export function resetAdbPathCache(): void {
  cachedPath = null
}

export function spawnAdb(args: string[]): ChildProcessWithoutNullStreams {
  return spawn(resolveAdbPath(), args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
}

/** Runs a short control command and buffers its text output. Never use for file bytes. */
export function runAdb(args: string[], timeoutMs = 20000): Promise<AdbResult> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawnAdb(args)
    } catch (error) {
      reject(error)
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill()
        reject(new Error('ADB command timed out'))
      }
    }, timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (stdout.length < 8_000_000) stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 1_000_000) stderr += chunk
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(error.message.includes('ENOENT') ? 'adb.exe not found. Set the ADB path in Settings.' : error.message))
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr })
    })
  })
}

export async function startAdbServer(): Promise<void> {
  try {
    await runAdb(['start-server'], 30000)
  } catch {
    // adb is optional until a device is used; surfaces on connect instead.
  }
}

export async function adbVersion(): Promise<string> {
  try {
    const result = await runAdb(['version'], 10000)
    if (result.code !== 0) return 'ADB unavailable'
    const line = result.stdout.split(/\r?\n/).find((l) => l.startsWith('Android Debug Bridge'))
    return line?.trim() ?? 'ADB available'
  } catch (error) {
    return error instanceof Error ? error.message : 'ADB unavailable'
  }
}
