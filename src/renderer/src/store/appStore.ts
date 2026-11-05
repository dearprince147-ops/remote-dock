import { create } from 'zustand'
import type { Device, FileEntry, HostKeyPrompt, Settings } from '@shared/types'
import { api, errorMessage } from '../lib/api'
import { applyAccent } from '../lib/accent'

export type View = 'devices' | 'explorer' | 'settings'
export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
}

export interface ConfirmOptions {
  title: string
  message?: string
  details?: string[]
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  checkboxLabel?: string
  checkboxDefault?: boolean
}

interface ConfirmState extends ConfirmOptions {
  resolve: (result: { ok: boolean; checked: boolean }) => void
}

export interface PromptOptions {
  title: string
  label?: string
  value?: string
  placeholder?: string
  confirmLabel?: string
}

interface PromptState extends PromptOptions {
  resolve: (value: string | null) => void
}

interface AppState {
  ready: boolean
  settings: Settings | null
  devices: Device[]
  view: View
  activeDeviceId: string | null
  fullscreen: boolean
  toasts: Toast[]
  dialog: ConfirmState | null
  dialogChecked: boolean
  prompt: PromptState | null
  hostPrompt: HostKeyPrompt | null
  hostQueue: HostKeyPrompt[]
  preview: FileEntry | null

  setView(view: View): void
  openDevice(id: string): void
  openPreview(entry: FileEntry): void
  closePreview(): void
  refreshDevices(): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<Settings | null>
  pushToast(kind: ToastKind, message: string): void
  dismissToast(id: string): void
  confirm(options: ConfirmOptions): Promise<{ ok: boolean; checked: boolean }>
  resolveDialog(ok: boolean): void
  setDialogChecked(checked: boolean): void
  askText(options: PromptOptions): Promise<string | null>
  resolvePrompt(value: string | null): void
  enqueueHostPrompt(prompt: HostKeyPrompt): void
  answerHost(accept: boolean): Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  settings: null,
  devices: [],
  view: 'devices',
  activeDeviceId: null,
  fullscreen: false,
  toasts: [],
  dialog: null,
  dialogChecked: false,
  prompt: null,
  hostPrompt: null,
  hostQueue: [],
  preview: null,

  setView: (view) => set({ view, preview: null }),

  openDevice: (id) => set({ activeDeviceId: id, view: 'explorer', preview: null }),

  openPreview: (entry) => set({ preview: entry }),

  closePreview: () => set({ preview: null }),

  refreshDevices: async () => {
    try {
      const devices = await api.devices.list()
      set({ devices })
    } catch (error) {
      get().pushToast('error', errorMessage(error))
    }
  },

  updateSettings: async (patch) => {
    try {
      const next = await api.settings.set(patch)
      applyAccent(next.accent)
      set({ settings: next })
      return next
    } catch (error) {
      get().pushToast('error', errorMessage(error))
      return get().settings
    }
  },

  pushToast: (kind, message) => {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }].slice(-6) }))
    if (kind !== 'error') {
      setTimeout(() => get().dismissToast(id), 4000)
    }
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  confirm: (options) =>
    new Promise((resolve) => {
      set({ dialog: { ...options, resolve }, dialogChecked: options.checkboxDefault ?? false })
    }),

  resolveDialog: (ok) => {
    const dialog = get().dialog
    if (!dialog) return
    const checked = get().dialogChecked
    set({ dialog: null })
    dialog.resolve({ ok, checked })
  },

  setDialogChecked: (checked) => set({ dialogChecked: checked }),

  askText: (options) =>
    new Promise((resolve) => {
      set({ prompt: { ...options, resolve } })
    }),

  resolvePrompt: (value) => {
    const prompt = get().prompt
    if (!prompt) return
    set({ prompt: null })
    prompt.resolve(value)
  },

  enqueueHostPrompt: (prompt) => {
    const current = get().hostPrompt
    if (!current) set({ hostPrompt: prompt })
    else set((state) => ({ hostQueue: [...state.hostQueue, prompt] }))
  },

  answerHost: async (accept) => {
    const prompt = get().hostPrompt
    if (!prompt) return
    set({ hostPrompt: null })
    try {
      await api.hostkey.answer(prompt.requestId, accept)
    } catch {
      // The request may already have timed out.
    }
    const queue = get().hostQueue
    if (queue.length) {
      set({ hostPrompt: queue[0], hostQueue: queue.slice(1) })
    }
  }
}))

let started = false

export async function initApp(): Promise<void> {
  if (started) return
  started = true
  try {
    const settings = await api.settings.get()
    applyAccent(settings.accent)
    const devices = await api.devices.list()
    useAppStore.setState({ settings, devices, ready: true, fullscreen: settings.startFullscreen })

    api.devices.onEvent((list) => useAppStore.setState({ devices: list }))
    api.settings.onChanged((next) => {
      applyAccent(next.accent)
      useAppStore.setState({ settings: next })
    })
    api.window.onFullscreen((fullscreen) => useAppStore.setState({ fullscreen }))
    api.hostkey.onPrompt((prompt) => useAppStore.getState().enqueueHostPrompt(prompt))
  } catch (error) {
    useAppStore.setState({ ready: true })
    useAppStore.getState().pushToast('error', errorMessage(error))
  }
}
