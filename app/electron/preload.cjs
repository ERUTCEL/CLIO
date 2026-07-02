const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('api', {
  selectPdf:       () => ipcRenderer.invoke('select-pdf'),
  getPathForFile:  (file) => webUtils.getPathForFile(file),
  openExternal:    (url) => ipcRenderer.invoke('open-external', url),
  getSettings:     () => ipcRenderer.invoke('get-settings'),
  saveSettings:    (s) => ipcRenderer.invoke('save-settings', s),
  getBackendStatus: () => ipcRenderer.invoke('get-backend-status'),
  getSystemInfo:   () => ipcRenderer.invoke('get-system-info'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  installUpdate:   () => ipcRenderer.invoke('install-update'),
  onUpdateStatus:  (cb) => {
    const listener = (_e, status) => cb(status)
    ipcRenderer.on('update-status', listener)
    return () => ipcRenderer.removeListener('update-status', listener)
  },
  onBackendStatus: (cb) => {
    const listener = (_e, status) => cb(status)
    ipcRenderer.on('backend-status', listener)
    return () => ipcRenderer.removeListener('backend-status', listener)
  },
  backendUrl:      'http://127.0.0.1:8001',
  isElectron:      true,
})
