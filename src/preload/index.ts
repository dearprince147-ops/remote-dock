import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { RemoteDockApi } from '@shared/api'

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: RemoteDockApi = {
  devices: {
    list: () => ipcRenderer.invoke(IPC.devicesList),
    connectSsh: (config) => ipcRenderer.invoke(IPC.devicesConnectSsh, config),
    connectAdb: (config) => ipcRenderer.invoke(IPC.devicesConnectAdb, config),
    disconnect: (id) => ipcRenderer.invoke(IPC.devicesDisconnect, id),
    onEvent: (callback) => subscribe(IPC.devicesEvent, callback)
  },
  saved: {
    list: () => ipcRenderer.invoke(IPC.savedList),
    save: (connection) => ipcRenderer.invoke(IPC.savedSave, connection),
    delete: (id) => ipcRenderer.invoke(IPC.savedDelete, id),
    connect: (id) => ipcRenderer.invoke(IPC.savedConnect, id)
  },
  fs: {
    home: (deviceId) => ipcRenderer.invoke(IPC.fsHome, deviceId),
    list: (deviceId, path) => ipcRenderer.invoke(IPC.fsList, deviceId, path),
    mkdir: (deviceId, path) => ipcRenderer.invoke(IPC.fsMkdir, deviceId, path),
    rename: (deviceId, from, to) => ipcRenderer.invoke(IPC.fsRename, deviceId, from, to),
    delete: (deviceId, path, isDir) => ipcRenderer.invoke(IPC.fsDelete, deviceId, path, isDir),
    readText: (deviceId, path, maxBytes) => ipcRenderer.invoke(IPC.fsReadText, deviceId, path, maxBytes)
  },
  transfers: {
    list: () => ipcRenderer.invoke(IPC.transfersList),
    download: (deviceId, entries, localDir) => ipcRenderer.invoke(IPC.transfersDownload, deviceId, entries, localDir),
    upload: (deviceId, localPaths, remoteDir) => ipcRenderer.invoke(IPC.transfersUpload, deviceId, localPaths, remoteDir),
    pause: (id) => ipcRenderer.invoke(IPC.transfersPause, id),
    resume: (id) => ipcRenderer.invoke(IPC.transfersResume, id),
    retry: (id) => ipcRenderer.invoke(IPC.transfersRetry, id),
    cancel: (id, deletePartial) => ipcRenderer.invoke(IPC.transfersCancel, id, deletePartial),
    clearFinished: () => ipcRenderer.invoke(IPC.transfersClearFinished),
    onUpdate: (callback) => subscribe(IPC.transfersUpdate, callback)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch),
    onChanged: (callback) => subscribe(IPC.settingsChanged, callback)
  },
  dialog: {
    pickFiles: () => ipcRenderer.invoke(IPC.dialogPickFiles),
    pickFolders: () => ipcRenderer.invoke(IPC.dialogPickFolders),
    pickDir: (title) => ipcRenderer.invoke(IPC.dialogPickDir, title)
  },
  hostkey: {
    onPrompt: (callback) => subscribe(IPC.hostkeyPrompt, callback),
    answer: (requestId, accept) => ipcRenderer.invoke(IPC.hostkeyAnswer, requestId, accept),
    list: () => ipcRenderer.invoke(IPC.hostkeyList),
    remove: (key) => ipcRenderer.invoke(IPC.hostkeyRemove, key)
  },
  shell: {
    showInFolder: (path) => ipcRenderer.invoke(IPC.shellShowInFolder, path),
    openDataFolder: () => ipcRenderer.invoke(IPC.shellOpenDataFolder)
  },
  window: {
    toggleFullscreen: () => ipcRenderer.invoke(IPC.windowToggleFullscreen),
    minimize: () => ipcRenderer.invoke(IPC.windowMinimize),
    close: () => ipcRenderer.invoke(IPC.windowClose),
    onFullscreen: (callback) => subscribe(IPC.windowFullscreen, callback)
  },
  app: {
    version: () => ipcRenderer.invoke(IPC.appVersion),
    adbVersion: () => ipcRenderer.invoke(IPC.adbVersion),
    pathForFile: (file) => webUtils.getPathForFile(file as File)
  }
}

contextBridge.exposeInMainWorld('api', api)
