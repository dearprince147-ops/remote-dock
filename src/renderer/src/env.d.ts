import type { RemoteDockApi } from '@shared/api'

declare global {
  interface Window {
    api: RemoteDockApi
  }
}

export {}
