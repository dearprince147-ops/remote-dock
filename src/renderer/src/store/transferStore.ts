import { create } from 'zustand'
import type { Transfer, TransferAggregate, TransferSnapshot } from '@shared/types'
import { api, errorMessage } from '../lib/api'
import { useAppStore } from './appStore'

const emptyAggregate: TransferAggregate = {
  downBps: 0,
  upBps: 0,
  active: 0,
  queued: 0,
  paused: 0,
  failed: 0,
  remainingBytes: 0,
  etaSec: null,
  overallPct: 0
}

interface TransferState {
  transfers: Transfer[]
  aggregate: TransferAggregate
  drawerOpen: boolean
  init(): Promise<void>
  setDrawerOpen(open: boolean): void
  toggleDrawer(): void
  pause(id: string | 'all'): Promise<void>
  resume(id: string | 'all'): Promise<void>
  retry(id: string | 'all'): Promise<void>
  cancel(id: string): Promise<void>
  clearFinished(): Promise<void>
  showInFolder(path: string): Promise<void>
}

function report(error: unknown): void {
  useAppStore.getState().pushToast('error', errorMessage(error))
}

let transferInit = false

export const useTransferStore = create<TransferState>((set, get) => ({
  transfers: [],
  aggregate: emptyAggregate,
  drawerOpen: false,

  init: async () => {
    if (transferInit) return
    transferInit = true
    try {
      const snapshot = await api.transfers.list()
      set({ transfers: snapshot.transfers, aggregate: snapshot.aggregate })
      api.transfers.onUpdate((next: TransferSnapshot) =>
        set({ transfers: next.transfers, aggregate: next.aggregate })
      )
    } catch (error) {
      report(error)
    }
  },

  setDrawerOpen: (open) => set({ drawerOpen: open }),
  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),

  pause: async (id) => {
    try {
      await api.transfers.pause(id)
    } catch (error) {
      report(error)
    }
  },

  resume: async (id) => {
    try {
      await api.transfers.resume(id)
    } catch (error) {
      report(error)
    }
  },

  retry: async (id) => {
    try {
      await api.transfers.retry(id)
    } catch (error) {
      report(error)
    }
  },

  cancel: async (id) => {
    const result = await useAppStore.getState().confirm({
      title: 'Cancel this transfer?',
      message: 'The partial file can be kept so the transfer can resume later.',
      confirmLabel: 'Cancel transfer',
      cancelLabel: 'Keep transferring',
      danger: true,
      checkboxLabel: 'Delete the partial file as well',
      checkboxDefault: false
    })
    if (!result.ok) return
    try {
      await api.transfers.cancel(id, result.checked)
    } catch (error) {
      report(error)
    }
  },

  clearFinished: async () => {
    try {
      await api.transfers.clearFinished()
    } catch (error) {
      report(error)
    }
  },

  showInFolder: async (path) => {
    try {
      await api.shell.showInFolder(path)
    } catch (error) {
      report(error)
    }
  }
}))

export const transferCounts = (transfers: Transfer[]): { total: number; active: number } => ({
  total: transfers.length,
  active: transfers.filter((item) => item.status === 'running' || item.status === 'queued').length
})
