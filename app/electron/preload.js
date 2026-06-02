import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  selectFolder:  ()      => ipcRenderer.invoke('select-folder'),
  hasApiKey:     ()      => ipcRenderer.invoke('has-api-key'),
  setApiKey:     (key)   => ipcRenderer.invoke('set-api-key', key),
  clearApiKey:   ()      => ipcRenderer.invoke('clear-api-key'),
  isElectron:    true,
})
