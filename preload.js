const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getTabs: () => ipcRenderer.invoke('get-tabs'),
  saveTabs: (data) => ipcRenderer.invoke('save-tabs', data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onSwitchNextTab: (callback) => ipcRenderer.on('switch-next-tab', callback),
  setModalState: (isOpen) => ipcRenderer.send('set-modal-state', isOpen),
  getAutoLaunchStatus: () => ipcRenderer.invoke('get-auto-launch-status'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  getShortcut: () => ipcRenderer.invoke('get-shortcut'),
  setShortcut: (shortcut) => ipcRenderer.invoke('set-shortcut', shortcut),
  backupConfig: () => ipcRenderer.invoke('backup-config'),
  restoreConfig: () => ipcRenderer.invoke('restore-config'),
  updateWebviewNavigationMode: (webContentsId, navigationMode, widgetUrl) =>
    ipcRenderer.send('update-webview-navigation-mode', webContentsId, navigationMode, widgetUrl)
});
