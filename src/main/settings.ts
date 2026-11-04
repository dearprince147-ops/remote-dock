import path from 'node:path'
import { app } from 'electron'
import type { Settings } from '@shared/types'
import { readJson, writeJson } from './store'

let cache: Settings | null = null

export function defaultSettings(): Settings {
  return {
    accent: '#22c55e',
    startFullscreen: true,
    downloadDir: path.join(app.getPath('downloads'), 'RemoteDock'),
    maxConcurrentTransfers: 2,
    conflictPolicy: 'rename',
    autoReconnect: true,
    reconnectMaxAttempts: 10,
    verifyHash: false,
    bandwidthLimitKBps: 0,
    showHidden: false,
    confirmDelete: true,
    defaultSshPort: 22,
    adbPathOverride: '',
    view: 'list',
    sortBy: 'name',
    sortDir: 'asc',
    speedUnit: 'bytes'
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function sanitize(raw: Partial<Settings>, base: Settings): Settings {
  const bool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback
  return {
    accent: typeof raw.accent === 'string' && HEX.test(raw.accent) ? raw.accent.toLowerCase() : base.accent,
    startFullscreen: bool(raw.startFullscreen, base.startFullscreen),
    downloadDir: typeof raw.downloadDir === 'string' && raw.downloadDir.trim() ? raw.downloadDir : base.downloadDir,
    maxConcurrentTransfers: clampInt(raw.maxConcurrentTransfers, 1, 4, base.maxConcurrentTransfers),
    conflictPolicy:
      raw.conflictPolicy === 'overwrite' || raw.conflictPolicy === 'skip' || raw.conflictPolicy === 'rename'
        ? raw.conflictPolicy
        : base.conflictPolicy,
    autoReconnect: bool(raw.autoReconnect, base.autoReconnect),
    reconnectMaxAttempts: clampInt(raw.reconnectMaxAttempts, 0, 1000, base.reconnectMaxAttempts),
    verifyHash: bool(raw.verifyHash, base.verifyHash),
    bandwidthLimitKBps: clampInt(raw.bandwidthLimitKBps, 0, 1_000_000, base.bandwidthLimitKBps),
    showHidden: bool(raw.showHidden, base.showHidden),
    confirmDelete: bool(raw.confirmDelete, base.confirmDelete),
    defaultSshPort: clampInt(raw.defaultSshPort, 1, 65535, base.defaultSshPort),
    adbPathOverride: typeof raw.adbPathOverride === 'string' ? raw.adbPathOverride.trim() : base.adbPathOverride,
    view: raw.view === 'grid' || raw.view === 'list' ? raw.view : base.view,
    sortBy: raw.sortBy === 'size' || raw.sortBy === 'mtime' || raw.sortBy === 'name' ? raw.sortBy : base.sortBy,
    sortDir: raw.sortDir === 'desc' || raw.sortDir === 'asc' ? raw.sortDir : base.sortDir,
    speedUnit: raw.speedUnit === 'bits' || raw.speedUnit === 'bytes' ? raw.speedUnit : base.speedUnit
  }
}

export async function getSettings(): Promise<Settings> {
  if (cache) return cache
  const base = defaultSettings()
  const raw = await readJson<Partial<Settings>>('settings.json', {})
  cache = sanitize(raw, base)
  return cache
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  cache = sanitize({ ...current, ...patch }, current)
  await writeJson('settings.json', cache)
  return cache
}
