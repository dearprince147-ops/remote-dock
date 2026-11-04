import type {
  AdbConnectConfig,
  Device,
  FileEntry,
  HostKeyPrompt,
  KnownHost,
  QuickLink,
  SavedConnection,
  Settings,
  SshConfig,
  Transfer,
  TransferSnapshot
} from './types'

export interface RemoteDockApi {
  devices: {
    list(): Promise<Device[]>
    connectSsh(cfg: SshConfig): Promise<Device>
    connectAdb(cfg: AdbConnectConfig): Promise<Device[]>
    disconnect(id: string): Promise<void>
    onEvent(cb: (devices: Device[]) => void): () => void
  }
  saved: {
    list(): Promise<SavedConnection[]>
    save(connection: SavedConnection): Promise<SavedConnection[]>
    delete(id: string): Promise<void>
    connect(id: string): Promise<Device>
  }
  fs: {
    home(deviceId: string): Promise<{ home: string; links: QuickLink[] }>
    list(deviceId: string, path: string): Promise<FileEntry[]>
    mkdir(deviceId: string, path: string): Promise<void>
    rename(deviceId: string, from: string, to: string): Promise<void>
    delete(deviceId: string, path: string, isDir: boolean): Promise<void>
  }
  transfers: {
    list(): Promise<TransferSnapshot>
    download(deviceId: string, entries: FileEntry[], localDir?: string): Promise<void>
    upload(deviceId: string, localPaths: string[], remoteDir: string): Promise<void>
    pause(id: string | 'all'): Promise<void>
    resume(id: string | 'all'): Promise<void>
    retry(id: string | 'all'): Promise<void>
    cancel(id: string, deletePartial: boolean): Promise<void>
    clearFinished(): Promise<void>
    onUpdate(cb: (snapshot: TransferSnapshot) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    onChanged(cb: (settings: Settings) => void): () => void
  }
  dialog: {
    pickFiles(): Promise<string[]>
    pickFolders(): Promise<string[]>
    pickDir(title?: string): Promise<string | null>
  }
  hostkey: {
    onPrompt(cb: (prompt: HostKeyPrompt) => void): () => void
    answer(requestId: string, accept: boolean): Promise<void>
    list(): Promise<KnownHost[]>
    remove(key: string): Promise<void>
  }
  shell: {
    showInFolder(path: string): Promise<void>
    openDataFolder(): Promise<void>
  }
  window: {
    toggleFullscreen(): Promise<void>
    minimize(): Promise<void>
    close(): Promise<void>
    onFullscreen(cb: (fullscreen: boolean) => void): () => void
  }
  app: {
    version(): Promise<string>
    adbVersion(): Promise<string>
    pathForFile(file: File): string
  }
}

export type { Transfer }
