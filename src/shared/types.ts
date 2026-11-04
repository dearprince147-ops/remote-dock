export type DeviceKind = 'ssh' | 'adb'
export type DeviceStatus = 'connected' | 'reconnecting' | 'disconnected' | 'unauthorized'

export interface SshConfig {
  name?: string
  host: string
  port: number
  username: string
  auth: 'password' | 'key'
  password?: string
  privateKeyPath?: string
  passphrase?: string
  save?: boolean
}

export type AdbConnectConfig =
  | { mode: 'usb' }
  | { mode: 'wifi'; host: string; port: number }

export interface Device {
  id: string
  kind: DeviceKind
  name: string
  subtitle: string
  status: DeviceStatus
  statusDetail?: string
}

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  isSymlink: boolean
  size: number
  mtime: number
  mode?: string
}

export type QuickLinkIcon =
  | 'home'
  | 'root'
  | 'storage'
  | 'download'
  | 'image'
  | 'video'
  | 'music'
  | 'camera'
  | 'folder'

export interface QuickLink {
  label: string
  path: string
  icon: QuickLinkIcon
}

export interface SavedConnection {
  id: string
  kind: 'ssh'
  name: string
  host: string
  port: number
  username: string
  auth: 'password' | 'key'
  privateKeyPath?: string
  secret?: string
}

export type TransferDirection = 'download' | 'upload'
export type TransferStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'waiting-connection'
  | 'verifying'
  | 'done'
  | 'error'
  | 'canceled'

export interface Transfer {
  id: string
  deviceId: string
  deviceName: string
  direction: TransferDirection
  name: string
  localPath: string
  remotePath: string
  totalBytes: number
  doneBytes: number
  status: TransferStatus
  speedBps: number
  etaSec: number | null
  error?: string
  sourceSize?: number
  sourceMtime?: number
  createdAt: number
  finishedAt?: number
}

export interface TransferAggregate {
  downBps: number
  upBps: number
  active: number
  queued: number
  paused: number
  failed: number
  remainingBytes: number
  etaSec: number | null
  overallPct: number
}

export interface Settings {
  accent: string
  startFullscreen: boolean
  downloadDir: string
  maxConcurrentTransfers: number
  conflictPolicy: 'rename' | 'overwrite' | 'skip'
  autoReconnect: boolean
  reconnectMaxAttempts: number
  verifyHash: boolean
  bandwidthLimitKBps: number
  showHidden: boolean
  confirmDelete: boolean
  defaultSshPort: number
  adbPathOverride: string
  view: 'list' | 'grid'
  sortBy: 'name' | 'size' | 'mtime'
  sortDir: 'asc' | 'desc'
  speedUnit: 'bytes' | 'bits'
}

export interface HostKeyPrompt {
  requestId: string
  host: string
  port: number
  fingerprint: string
  changed: boolean
}

export interface KnownHost {
  key: string
  host: string
  port: number
  fingerprint: string
  addedAt: number
}

export interface TransferSnapshot {
  transfers: Transfer[]
  aggregate: TransferAggregate
}
