import { useAppStore } from '../store/appStore'
import { useExplorerStore } from '../store/explorerStore'
import { useTransferStore } from '../store/transferStore'

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

/** Global keyboard shortcuts. Registered once by App. */
export function installHotkeys(): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const app = useAppStore.getState()
    const explorer = useExplorerStore.getState()

    if (event.key === 'Escape') {
      if (app.dialog || app.prompt || app.hostPrompt) return
      if (app.preview) {
        app.closePreview()
        return
      }
      if (useTransferStore.getState().drawerOpen) {
        useTransferStore.getState().setDrawerOpen(false)
        return
      }
      if (app.view === 'settings') {
        app.closeSettings()
        return
      }
      if (explorer.selection.length) {
        explorer.clearSelection()
        return
      }
      if (app.view === 'explorer' && explorer.filter) {
        explorer.setFilter('')
        return
      }
      return
    }

    if (app.preview) return
    if (isTyping(event.target)) return
    if (event.key === 'F11') return

    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()

    if (app.view !== 'explorer') {
      if (mod && event.key === ',') {
        event.preventDefault()
        app.openSettings()
      }
      return
    }

    if (event.key === 'F5') {
      event.preventDefault()
      void explorer.refresh()
      return
    }
    if (event.key === 'F2') {
      event.preventDefault()
      void explorer.renameSelected()
      return
    }
    if (event.key === 'Delete') {
      event.preventDefault()
      void explorer.deleteSelected()
      return
    }
    if (mod && key === 'a') {
      event.preventDefault()
      explorer.selectAll()
      return
    }
    if (mod && key === 'u') {
      event.preventDefault()
      void explorer.uploadFiles()
      return
    }
    if (mod && key === 'd') {
      event.preventDefault()
      void explorer.downloadSelected()
      return
    }
    if (mod && event.shiftKey && key === 'n') {
      event.preventDefault()
      void explorer.newFolder()
      return
    }
    if (mod && key === 'f') {
      event.preventDefault()
      document.querySelector<HTMLInputElement>('[data-filter-input]')?.focus()
      return
    }
    if (mod && key === 'h') {
      event.preventDefault()
      void explorer.toggleHidden()
      return
    }
    if (mod && event.key === ',') {
      event.preventDefault()
      app.openSettings()
      return
    }
    if (event.key === 'Backspace' || (event.altKey && event.key === 'ArrowUp')) {
      event.preventDefault()
      void explorer.up()
      return
    }
    if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault()
      void explorer.back()
      return
    }
    if (event.altKey && event.key === 'ArrowRight') {
      event.preventDefault()
      void explorer.forward()
    }
  }

  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}
