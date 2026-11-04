import { app, Menu, nativeTheme } from 'electron'
import { getSettings } from './settings'
import { createMainWindow, getMainWindow } from './window'
import { setupIpc, type Services } from './ipc'
import { startAdbServer } from './devices/adbBinary'

let services: Services | null = null
let quitting = false

// Dev-only: exposes the Chrome DevTools protocol for UI debugging.
if (!app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', '9333')
}

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = getMainWindow()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.remotedock.app')
    Menu.setApplicationMenu(null)
    nativeTheme.themeSource = 'dark'

    const settings = await getSettings()
    createMainWindow(settings)
    services = setupIpc()
    await startAdbServer()
    services.deviceManager.start()
  })

  app.on('activate', () => {
    if (!getMainWindow()) void getSettings().then((settings) => createMainWindow(settings))
  })

  app.on('window-all-closed', () => app.quit())

  app.on('before-quit', (event) => {
    if (quitting || !services) return
    event.preventDefault()
    quitting = true
    services.deviceManager.stop()
    void services.transferManager
      .shutdown()
      .catch(() => undefined)
      .finally(() => app.quit())
  })
}
