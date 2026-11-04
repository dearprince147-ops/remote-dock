import type { KnownHost } from '@shared/types'
import { readJson, writeJson } from '../store'

type HostRecord = { fingerprint: string; addedAt: number }
type HostsFile = Record<string, HostRecord>

let cache: HostsFile | null = null

function hostKey(host: string, port: number): string {
  return `${host}:${port}`
}

async function load(): Promise<HostsFile> {
  if (!cache) {
    const loaded = await readJson<HostsFile>('knownHosts.json', {})
    cache = loaded
    return loaded
  }
  return cache
}

async function persist(): Promise<void> {
  await writeJson('knownHosts.json', cache ?? {})
}

export async function primeHosts(): Promise<void> {
  await load()
}

/** Synchronous lookup for ssh2's synchronous hostVerifier. Call primeHosts() first. */
export function peekHost(host: string, port: number): HostRecord | undefined {
  return cache?.[hostKey(host, port)]
}

export type VerifyResult = 'ok' | 'unknown' | 'changed'

export async function verifyHost(host: string, port: number, fingerprint: string): Promise<VerifyResult> {
  const hosts = await load()
  const record = hosts[hostKey(host, port)]
  if (!record) return 'unknown'
  return record.fingerprint === fingerprint ? 'ok' : 'changed'
}

export async function addHost(host: string, port: number, fingerprint: string): Promise<void> {
  const hosts = await load()
  hosts[hostKey(host, port)] = { fingerprint, addedAt: Date.now() }
  await persist()
}

export async function removeHost(key: string): Promise<void> {
  const hosts = await load()
  delete hosts[key]
  await persist()
}

export async function listHosts(): Promise<KnownHost[]> {
  const hosts = await load()
  return Object.entries(hosts)
    .map(([key, value]) => {
      const idx = key.lastIndexOf(':')
      return {
        key,
        host: key.slice(0, idx),
        port: Number(key.slice(idx + 1)),
        fingerprint: value.fingerprint,
        addedAt: value.addedAt
      }
    })
    .sort((a, b) => a.host.localeCompare(b.host))
}
