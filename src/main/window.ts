import { BrowserWindow, nativeTheme } from 'electron'
import path from 'node:path'
import type { Settings } from '@shared/types'
import { IPC } from '@shared/ipc'

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createMainWindow(settings: Settings): BrowserWindow {
  nativeTheme.themeSource = 'dark'
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0d0e',
    autoHideMenuBar: true,
    fullscreen: settings.startFullscreen,
    title: 'RemoteDock',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow = window

  window.once('ready-to-show', () => {
    window.show()
    if (settings.startFullscreen) window.setFullScreen(true)
  })

  window.on('enter-full-screen', () => window.webContents.send(IPC.windowFullscreen, true))
  window.on('leave-full-screen', () => window.webContents.send(IPC.windowFullscreen, false))
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault()
      window.setFullScreen(!window.isFullScreen())
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  if (process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return window
}

export function toggleFullscreen(): void {
  const window = getMainWindow()
  if (!window) return
  window.setFullScreen(!window.isFullScreen())
}

export function minimizeWindow(): void {
  getMainWindow()?.minimize()
}

export function closeWindow(): void {
  getMainWindow()?.close()
}
