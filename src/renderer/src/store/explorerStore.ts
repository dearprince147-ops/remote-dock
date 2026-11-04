import { create } from 'zustand'
import type { FileEntry, QuickLink, Settings } from '@shared/types'
import { api, errorMessage } from '../lib/api'
import { useAppStore } from './appStore'
import { useTransferStore } from './transferStore'

function norm(target: string): string {
  if (!target) return '/'
  const value = target.replace(/\\/g, '/').replace(/\/+/g, '/')
  return value.length > 1 ? value.replace(/\/$/, '') : value
}

function parent(target: string): string {
  const value = norm(target)
  if (value === '/') return '/'
  const index = value.lastIndexOf('/')
  return index <= 0 ? '/' : value.slice(0, index)
}

function join(dir: string, name: string): string {
  return norm(`${norm(dir)}/${name}`)
}

export function visibleEntries(entries: FileEntry[], settings: Settings | null): FileEntry[] {
  const showHidden = settings?.showHidden ?? false
  const sortBy = settings?.sortBy ?? 'name'
  const sortDir = settings?.sortDir ?? 'asc'
  const filtered = entries.filter((entry) => showHidden || !entry.name.startsWith('.'))
  return filtered.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    let cmp = 0
    if (sortBy === 'size') cmp = a.size - b.size
    else if (sortBy === 'mtime') cmp = a.mtime - b.mtime
    else cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    return sortDir === 'asc' ? cmp : -cmp
  })
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

function invalidName(name: string): string | null {
  if (!name.trim()) return 'The name cannot be empty'
  if (name.includes('/') || name.includes('\\')) return 'The name cannot contain slashes'
  if (name === '.' || name === '..') return 'That name is reserved'
  return null
}

export interface ExplorerState {
  deviceId: string | null
  home: string
  path: string
  links: QuickLink[]
  entries: FileEntry[]
  loading: boolean
  error: string | null
  selection: string[]
  anchor: string | null
  filter: string
  history: string[]
  historyIndex: number

  open(deviceId: string): Promise<void>
  load(target?: string): Promise<void>
  refresh(): Promise<void>
  navigate(target: string): Promise<void>
  back(): Promise<void>
  forward(): Promise<void>
  up(): Promise<void>
  setFilter(value: string): void
  setSelection(paths: string[], anchor?: string | null): void
  toggle(path: string): void
  selectAll(): void
  clearSelection(): void
  setSort(field: 'name' | 'size' | 'mtime'): Promise<void>
  toggleHidden(): Promise<void>
  selectedEntries(): FileEntry[]
  downloadSelected(localDir?: string): Promise<void>
  downloadTo(): Promise<void>
  downloadEntry(entry: FileEntry): Promise<void>
  uploadFiles(): Promise<void>
  uploadFolders(): Promise<void>
  uploadPaths(paths: string[]): Promise<void>
  newFolder(): Promise<void>
  renameSelected(): Promise<void>
  deleteSelected(): Promise<void>
  copySelectedPath(): Promise<void>
  copyPath(target: string): Promise<void>
}

interface DeviceSnapshot {
  home: string
  path: string
  links: QuickLink[]
  entries: FileEntry[]
  selection: string[]
  anchor: string | null
  filter: string
  history: string[]
  historyIndex: number
}

const deviceSnapshots = new Map<string, DeviceSnapshot>()

function snapshotOf(state: ExplorerState): DeviceSnapshot {
  const { home, path, links, entries, selection, anchor, filter, history, historyIndex } = state
  return {
    home,
    path,
    links: [...links],
    entries: [...entries],
    selection: [...selection],
    anchor,
    filter,
    history: [...history],
    historyIndex
  }
}

const initialState = {
  deviceId: null,
  home: '',
  path: '',
  links: [] as QuickLink[],
  entries: [] as FileEntry[],
  loading: false,
  error: null as string | null,
  selection: [] as string[],
  anchor: null as string | null,
  filter: '',
  history: [] as string[],
  historyIndex: -1
}

export const useExplorerStore = create<ExplorerState>((set, get) => ({
  ...initialState,

  open: async (deviceId) => {
    const current = get()
    if (current.deviceId === deviceId && current.path) return

    if (current.deviceId && current.path) {
      deviceSnapshots.set(current.deviceId, snapshotOf(current))
    }

    const cached = deviceSnapshots.get(deviceId)
    if (cached) {
      set({ ...cached, deviceId, error: null })
      try {
        const entries = await api.fs.list(deviceId, cached.path)
        const selection = cached.selection.filter((item) => entries.some((entry) => entry.path === item))
        set({ entries, selection })
      } catch (error) {
        set({ entries: [], loading: false, error: errorMessage(error) })
      }
      return
    }

    set({ ...initialState, deviceId, loading: true })
    try {
      const { home, links } = await api.fs.home(deviceId)
      set({ home, links, path: home, history: [home], historyIndex: 0 })
      await get().load(home)
    } catch (error) {
      set({ loading: false, error: errorMessage(error) })
    }
  },

  load: async (target) => {
    const deviceId = get().deviceId
    if (!deviceId) return
    const next = norm(target ?? get().path ?? '/')
    set({ loading: true, error: null, path: next, selection: [], anchor: null })
    try {
      const entries = await api.fs.list(deviceId, next)
      set({ entries, loading: false })
    } catch (error) {
      set({ entries: [], loading: false, error: errorMessage(error) })
    }
  },

  refresh: async () => {
    const deviceId = get().deviceId
    if (!deviceId) return
    const current = get().path
    set({ loading: true, error: null })
    try {
      const entries = await api.fs.list(deviceId, current)
      const selection = get().selection.filter((item) => entries.some((entry) => entry.path === item))
      set({ entries, loading: false, selection })
    } catch (error) {
      set({ loading: false, error: errorMessage(error) })
    }
  },

  navigate: async (target) => {
    const next = norm(target)
    if (next === get().path) {
      await get().refresh()
      return
    }
    const history = get().history.slice(0, get().historyIndex + 1)
    history.push(next)
    set({ history, historyIndex: history.length - 1 })
    await get().load(next)
  },

  back: async () => {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return
    const index = historyIndex - 1
    set({ historyIndex: index })
    await get().load(history[index])
  },

  forward: async () => {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length - 1) return
    const index = historyIndex + 1
    set({ historyIndex: index })
    await get().load(history[index])
  },

  up: async () => {
    const current = get().path
    const target = parent(current)
    if (target === current) return
    await get().navigate(target)
  },

  setFilter: (value) => set({ filter: value }),

  setSelection: (paths, anchor = null) => set({ selection: [...new Set(paths)], anchor }),

  toggle: (target) =>
    set((state) => ({
      selection: state.selection.includes(target)
        ? state.selection.filter((item) => item !== target)
        : [...state.selection, target]
    })),

  selectAll: () => {
    const settings = useAppStore.getState().settings
    const entries = visibleEntries(get().entries, settings)
    set({ selection: entries.map((entry) => entry.path) })
  },

  clearSelection: () => set({ selection: [], anchor: null }),

  setSort: async (field) => {
    const settings = useAppStore.getState().settings
    if (!settings) return
    const sortDir = settings.sortBy === field && settings.sortDir === 'asc' ? 'desc' : 'asc'
    await useAppStore.getState().updateSettings({ sortBy: field, sortDir })
  },

  toggleHidden: async () => {
    const settings = useAppStore.getState().settings
    if (!settings) return
    await useAppStore.getState().updateSettings({ showHidden: !settings.showHidden })
  },

  selectedEntries: () => {
    const selected = new Set(get().selection)
    return get().entries.filter((entry) => selected.has(entry.path))
  },

  downloadSelected: async (localDir) => {
    const deviceId = get().deviceId
    const entries = get().selectedEntries()
    if (!deviceId || !entries.length) return
    try {
      await api.transfers.download(deviceId, entries, localDir)
      useAppStore.getState().pushToast('info', `Queued ${entries.length} item${entries.length === 1 ? '' : 's'} for download`)
      useTransferStore.getState().setDrawerOpen(true)
    } catch (error) {
      useAppStore.getState().pushToast('error', errorMessage(error))
    }
  },

  downloadTo: async () => {
    const dir = await api.dialog.pickDir('Download to folder')
    if (!dir) return
    await get().downloadSelected(dir)
  },

  downloadEntry: async (entry) => {
    await get().setSelection([entry.path], entry.path)
    await get().downloadSelected()
  },

  uploadFiles: async () => {
    const paths = await api.dialog.pickFiles()
    await get().uploadPaths(paths)
  },

  uploadFolders: async () => {
    const paths = await api.dialog.pickFolders()
    await get().uploadPaths(paths)
  },

  uploadPaths: async (paths) => {
    const deviceId = get().deviceId
    if (!deviceId || !paths.length) return
    try {
      await api.transfers.upload(deviceId, paths, get().path)
      useAppStore.getState().pushToast('info', `Queued ${paths.length} item${paths.length === 1 ? '' : 's'} for upload`)
      useTransferStore.getState().setDrawerOpen(true)
    } catch (error) {
      useAppStore.getState().pushToast('error', errorMessage(error))
    }
  },

  newFolder: async () => {
    const deviceId = get().deviceId
    if (!deviceId) return
    const name = await useAppStore.getState().askText({
      title: 'New folder',
      label: `Create a folder in ${get().path}`,
      placeholder: 'Folder name',
      confirmLabel: 'Create'
    })
    if (name === null) return
    const problem = invalidName(name)
    if (problem) {
      useAppStore.getState().pushToast('error', problem)
      return
    }
    try {
      await api.fs.mkdir(deviceId, join(get().path, name.trim()))
      await get().refresh()
      useAppStore.getState().pushToast('success', `Created “${name.trim()}”`)
    } catch (error) {
      useAppStore.getState().pushToast('error', errorMessage(error))
    }
  },

  renameSelected: async () => {
    const deviceId = get().deviceId
    const selected = get().selectedEntries()
    if (!deviceId || selected.length !== 1) return
    const entry = selected[0]
    const name = await useAppStore.getState().askText({
      title: 'Rename',
      label: `Rename “${entry.name}”`,
      value: entry.name,
      confirmLabel: 'Rename'
    })
    if (name === null || name.trim() === entry.name) return
    const problem = invalidName(name)
    if (problem) {
      useAppStore.getState().pushToast('error', problem)
      return
    }
    try {
      await api.fs.rename(deviceId, entry.path, join(get().path, name.trim()))
      await get().refresh()
      useAppStore.getState().pushToast('success', `Renamed to “${name.trim()}”`)
    } catch (error) {
      useAppStore.getState().pushToast('error', errorMessage(error))
    }
  },

  deleteSelected: async () => {
    const deviceId = get().deviceId
    const selected = get().selectedEntries()
    if (!deviceId || !selected.length) return
    const settings = useAppStore.getState().settings
    if (settings?.confirmDelete !== false) {
      const names = selected.slice(0, 5).map((entry) => entry.name)
      if (selected.length > 5) names.push(`and ${selected.length - 5} more`)
      const result = await useAppStore.getState().confirm({
        title: selected.length === 1 ? `Delete “${selected[0].name}”?` : `Delete ${selected.length} items?`,
        message: 'Deleted items cannot be recovered.',
        details: names,
        confirmLabel: 'Delete',
        danger: true
      })
      if (!result.ok) return
    }
    let failures = 0
    for (const entry of selected) {
      try {
        await api.fs.delete(deviceId, entry.path, entry.isDir)
      } catch {
        failures++
      }
    }
    await get().refresh()
    if (failures) useAppStore.getState().pushToast('error', `${failures} item(s) could not be deleted`)
    else useAppStore.getState().pushToast('success', `Deleted ${selected.length} item${selected.length === 1 ? '' : 's'}`)
  },

  copySelectedPath: async () => {
    const selected = get().selectedEntries()
    if (!selected.length) return
    await get().copyPath(selected.map((entry) => entry.path).join('\n'))
  },

  copyPath: async (target) => {
    await copyText(target)
    useAppStore.getState().pushToast('success', 'Path copied')
  }
}))

export const explorerPaths = { norm, parent, join }
