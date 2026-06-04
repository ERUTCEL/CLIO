const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('api', {
  selectFolder:    () => ipcRenderer.invoke('select-folder'),
  getPathForFile:  (file) => webUtils.getPathForFile(file),
  openExternal:    (url) => ipcRenderer.invoke('open-external', url),
  getSettings:     () => ipcRenderer.invoke('get-settings'),
  saveSettings:    (s) => ipcRenderer.invoke('save-settings', s),
  isElectron:      true,
})
