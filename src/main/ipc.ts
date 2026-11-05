import { app, dialog, ipcMain, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import type { AdbConnectConfig, FileEntry, HostKeyPrompt, Settings, SshConfig } from '@shared/types'
import { IPC } from '@shared/ipc'
import { getMainWindow } from './window'
import { getSettings, updateSettings } from './settings'
import { DeviceManager } from './devices/deviceManager'
import { TransferManager } from './transfers/transferManager'
import { adbVersion, resolveAdbPath, resetAdbPathCache } from './devices/adbBinary'
import { listHosts, removeHost } from './devices/hostKeys'
import { readTextPreview, registerPreviewProtocol } from './devices/preview'
import { configFromSaved, deleteSaved, listSaved, saveFromConfig, saveSaved } from './savedConnections'

export interface Services {
  deviceManager: DeviceManager
  transferManager: TransferManager
}

function str(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.length) throw new Error(`${name} is required`)
  return value
}

function deviceId(value: unknown): string {
  return str(value, 'Device')
}

function broadcast(channel: string, payload: unknown): void {
  getMainWindow()?.webContents.send(channel, payload)
}

export function setupIpc(): Services {
  const pendingHostKeys = new Map<string, (accept: boolean) => void>()

  const promptHostKey = (host: string, port: number, fingerprint: string, changed: boolean): Promise<boolean> => {
    const window = getMainWindow()
    if (!window) return Promise.resolve(false)
    const requestId = randomUUID()
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        pendingHostKeys.delete(requestId)
        resolve(false)
      }, 120_000)
      pendingHostKeys.set(requestId, (accept) => {
        clearTimeout(timer)
        pendingHostKeys.delete(requestId)
        resolve(accept)
      })
      const payload: HostKeyPrompt = { requestId, host, port, fingerprint, changed }
      window.webContents.send(IPC.hostkeyPrompt, payload)
    })
  }

  const deviceManager = new DeviceManager({ getSettings, promptHostKey })
  const transferManager = new TransferManager(deviceManager, getSettings)
  registerPreviewProtocol(deviceManager)

  deviceManager.on('devices', (devices) => broadcast(IPC.devicesEvent, devices))
  transferManager.on('update', (snapshot) => broadcast(IPC.transfersUpdate, snapshot))
  void transferManager.init()

  ipcMain.handle(IPC.devicesList, () => deviceManager.list())
  ipcMain.handle(IPC.devicesConnectSsh, async (_event, config: SshConfig) => {
    const device = await deviceManager.connectSsh(config)
    if (config.save) await saveFromConfig(config)
    return device
  })
  ipcMain.handle(IPC.devicesConnectAdb, (_event, config: AdbConnectConfig) => deviceManager.connectAdb(config))
  ipcMain.handle(IPC.devicesDisconnect, (_event, id: string) => deviceManager.disconnect(deviceId(id)))

  ipcMain.handle(IPC.savedList, () => listSaved())
  ipcMain.handle(IPC.savedSave, (_event, connection) => saveSaved(connection))
  ipcMain.handle(IPC.savedDelete, async (_event, id: string) => {
    await deleteSaved(str(id, 'Connection'))
  })
  ipcMain.handle(IPC.savedConnect, async (_event, id: string) => {
    const config = await configFromSaved(str(id, 'Connection'))
    return deviceManager.connectSsh(config)
  })

  ipcMain.handle(IPC.fsHome, async (_event, id: string) => deviceManager.provider(deviceId(id)).home())
  ipcMain.handle(IPC.fsList, async (_event, id: string, path: string) =>
    deviceManager.provider(deviceId(id)).list(str(path, 'Path'))
  )
  ipcMain.handle(IPC.fsMkdir, async (_event, id: string, path: string) => {
    await deviceManager.provider(deviceId(id)).mkdir(str(path, 'Path'))
  })
  ipcMain.handle(IPC.fsRename, async (_event, id: string, from: string, to: string) => {
    await deviceManager.provider(deviceId(id)).rename(str(from, 'Source'), str(to, 'Target'))
  })
  ipcMain.handle(IPC.fsDelete, async (_event, id: string, path: string, isDir: boolean) => {
    await deviceManager.provider(deviceId(id)).remove(str(path, 'Path'), Boolean(isDir))
  })
  ipcMain.handle(IPC.fsReadText, async (_event, id: string, path: string, maxBytes?: number) =>
    readTextPreview(
      deviceManager.provider(deviceId(id)),
      str(path, 'Path'),
      typeof maxBytes === 'number' ? maxBytes : undefined
    )
  )

  ipcMain.handle(IPC.transfersList, () => transferManager.snapshot())
  ipcMain.handle(IPC.transfersDownload, async (_event, id: string, entries: FileEntry[], localDir?: string) => {
    if (!Array.isArray(entries) || entries.length === 0) throw new Error('Choose at least one file')
    await transferManager.addDownload(deviceId(id), entries, localDir)
  })
  ipcMain.handle(IPC.transfersUpload, async (_event, id: string, localPaths: string[], remoteDir: string) => {
    if (!Array.isArray(localPaths) || localPaths.length === 0) throw new Error('Choose at least one file or folder')
    await transferManager.addUpload(deviceId(id), localPaths, str(remoteDir, 'Remote folder'))
  })
  ipcMain.handle(IPC.transfersPause, (_event, id: string) =>
    transferManager.pause(id === 'all' ? 'all' : str(id, 'Transfer'))
  )
  ipcMain.handle(IPC.transfersResume, (_event, id: string) =>
    transferManager.resume(id === 'all' ? 'all' : str(id, 'Transfer'))
  )
  ipcMain.handle(IPC.transfersRetry, (_event, id: string) =>
    transferManager.retry(id === 'all' ? 'all' : str(id, 'Transfer'))
  )
  ipcMain.handle(IPC.transfersCancel, (_event, id: string, deletePartialFile: boolean) =>
    transferManager.cancel(str(id, 'Transfer'), Boolean(deletePartialFile))
  )
  ipcMain.handle(IPC.transfersClearFinished, () => transferManager.clearFinished())

  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSet, async (_event, patch: Partial<Settings>) => {
    const before = await getSettings()
    const next = await updateSettings(patch)
    if (before.adbPathOverride !== next.adbPathOverride) resetAdbPathCache()
    broadcast(IPC.settingsChanged, next)
    return next
  })

  ipcMain.handle(IPC.dialogPickFiles, async () => {
    const window = getMainWindow()
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openFile', 'multiSelections'] })
      : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle(IPC.dialogPickFolders, async () => {
    const window = getMainWindow()
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openDirectory', 'multiSelections'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'] })
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle(IPC.dialogPickDir, async (_event, title?: string) => {
    const window = getMainWindow()
    const options = { title: typeof title === 'string' ? title : 'Choose folder', properties: ['openDirectory'] as Array<'openDirectory'> }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.hostkeyAnswer, (_event, requestId: string, accept: boolean) => {
    pendingHostKeys.get(str(requestId, 'Request'))?.(Boolean(accept))
  })
  ipcMain.handle(IPC.hostkeyList, () => listHosts())
  ipcMain.handle(IPC.hostkeyRemove, async (_event, key: string) => {
    await removeHost(str(key, 'Known host'))
  })

  ipcMain.handle(IPC.shellShowInFolder, (_event, path: string) => {
    shell.showItemInFolder(str(path, 'Path'))
  })
  ipcMain.handle(IPC.shellOpenDataFolder, async () => {
    await shell.openPath(app.getPath('userData'))
  })

  ipcMain.handle(IPC.windowToggleFullscreen, () => {
    const window = getMainWindow()
    if (window) window.setFullScreen(!window.isFullScreen())
  })
  ipcMain.handle(IPC.windowMinimize, () => getMainWindow()?.minimize())
  ipcMain.handle(IPC.windowClose, () => getMainWindow()?.close())

  ipcMain.handle(IPC.appVersion, () => app.getVersion())
  ipcMain.handle(IPC.adbVersion, async () => {
    const override = (await getSettings()).adbPathOverride
    const path = resolveAdbPath(override)
    const version = await adbVersion()
    return `${version} · ${path}`
  })

  return { deviceManager, transferManager }
}
