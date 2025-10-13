const { contextBridge, ipcRenderer, shell } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getTabs: () => ipcRenderer.invoke('get-tabs'),
  saveTabs: (data) => ipcRenderer.invoke('save-tabs', data),
  openExternal: (url) => shell.openExternal(url)
});
