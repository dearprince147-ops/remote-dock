import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

export function dataDir(): string {
  return app.getPath('userData')
}

/** Reads a JSON file from userData; returns `fallback` when missing or corrupt. */
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(dataDir(), name), 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Atomic JSON write: write `<name>.tmp`, then rename over `<name>`. */
export async function writeJson(name: string, data: unknown): Promise<void> {
  const dir = dataDir()
  await fs.mkdir(dir, { recursive: true })
  const target = path.join(dir, name)
  const tmp = `${target}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  try {
    await fs.rename(tmp, target)
  } catch {
    await fs.rm(target, { force: true })
    await fs.rename(tmp, target)
  }
}
