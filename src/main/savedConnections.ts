import { randomUUID } from 'node:crypto'
import type { SavedConnection, SshConfig } from '@shared/types'
import { readJson, writeJson } from './store'
import { decryptSecret, encryptSecret } from './secrets'

const FILE = 'connections.json'

export async function listSaved(): Promise<SavedConnection[]> {
  return readJson<SavedConnection[]>(FILE, [])
}

async function persist(list: SavedConnection[]): Promise<SavedConnection[]> {
  await writeJson(FILE, list)
  return list
}

export async function saveSaved(connection: SavedConnection): Promise<SavedConnection[]> {
  const list = await listSaved()
  const existing = list.findIndex((item) => item.id === connection.id)
  const clean: SavedConnection = { ...connection, name: connection.name.trim() || connection.host }
  if (existing >= 0) list[existing] = clean
  else list.push({ ...clean, id: clean.id || randomUUID() })
  return persist(list)
}

/** Saves (or updates) the connection used by a successful SSH connect. */
export async function saveFromConfig(config: SshConfig): Promise<SavedConnection[]> {
  const list = await listSaved()
  const id = `saved:${config.username}@${config.host}:${config.port}`
  const secret = config.auth === 'password' && config.password ? encryptSecret(config.password) ?? undefined : undefined
  const record: SavedConnection = {
    id,
    kind: 'ssh',
    name: config.name?.trim() || `${config.username}@${config.host}`,
    host: config.host,
    port: config.port,
    username: config.username,
    auth: config.auth,
    privateKeyPath: config.auth === 'key' ? config.privateKeyPath : undefined,
    secret
  }
  const existing = list.findIndex(
    (item) => item.host === config.host && item.port === config.port && item.username === config.username
  )
  if (existing >= 0) list[existing] = { ...record, id: list[existing].id }
  else list.push(record)
  return persist(list)
}

export async function deleteSaved(id: string): Promise<void> {
  const list = await listSaved()
  await persist(list.filter((item) => item.id !== id))
}

export async function configFromSaved(id: string): Promise<SshConfig> {
  const list = await listSaved()
  const saved = list.find((item) => item.id === id)
  if (!saved) throw new Error('Saved connection not found')
  const password = saved.auth === 'password' ? decryptSecret(saved.secret) : null
  if (saved.auth === 'password' && !password) {
    throw new Error('The saved password is unavailable on this machine. Connect manually instead.')
  }
  return {
    name: saved.name,
    host: saved.host,
    port: saved.port,
    username: saved.username,
    auth: saved.auth,
    password: password ?? undefined,
    privateKeyPath: saved.privateKeyPath
  }
}
