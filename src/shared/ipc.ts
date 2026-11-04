export const IPC = {
  devicesList: 'devices:list',
  devicesConnectSsh: 'devices:connectSsh',
  devicesConnectAdb: 'devices:connectAdb',
  devicesDisconnect: 'devices:disconnect',
  devicesEvent: 'devices:event',

  savedList: 'saved:list',
  savedSave: 'saved:save',
  savedDelete: 'saved:delete',
  savedConnect: 'saved:connect',

  fsHome: 'fs:home',
  fsList: 'fs:list',
  fsMkdir: 'fs:mkdir',
  fsRename: 'fs:rename',
  fsDelete: 'fs:delete',

  transfersList: 'transfers:list',
  transfersDownload: 'transfers:download',
  transfersUpload: 'transfers:upload',
  transfersPause: 'transfers:pause',
  transfersResume: 'transfers:resume',
  transfersRetry: 'transfers:retry',
  transfersCancel: 'transfers:cancel',
  transfersClearFinished: 'transfers:clearFinished',
  transfersUpdate: 'transfers:update',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsChanged: 'settings:changed',

  dialogPickFiles: 'dialog:pickFiles',
  dialogPickFolders: 'dialog:pickFolders',
  dialogPickDir: 'dialog:pickDir',

  hostkeyPrompt: 'hostkey:prompt',
  hostkeyAnswer: 'hostkey:answer',
  hostkeyList: 'hostkeys:list',
  hostkeyRemove: 'hostkeys:remove',

  shellShowInFolder: 'shell:showInFolder',
  shellOpenDataFolder: 'shell:openDataFolder',

  windowToggleFullscreen: 'window:toggleFullscreen',
  windowMinimize: 'window:minimize',
  windowClose: 'window:close',
  windowFullscreen: 'window:fullscreen',

  appVersion: 'app:version',
  adbVersion: 'adb:version'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
