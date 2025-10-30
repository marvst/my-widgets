const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getTabs: () => ipcRenderer.invoke('get-tabs'),
  saveTabs: (data) => ipcRenderer.invoke('save-tabs', data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  setModalState: (isOpen) => ipcRenderer.send('set-modal-state', isOpen),
  getAutoLaunchStatus: () => ipcRenderer.invoke('get-auto-launch-status'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  getPrivacyMode: () => ipcRenderer.invoke('get-privacy-mode'),
  setPrivacyMode: (enabled) => ipcRenderer.invoke('set-privacy-mode', enabled),
  getCompactMode: () => ipcRenderer.invoke('get-compact-mode'),
  setCompactMode: (enabled) => ipcRenderer.invoke('set-compact-mode', enabled),
  getShortcut: () => ipcRenderer.invoke('get-shortcut'),
  setShortcut: (shortcut) => ipcRenderer.invoke('set-shortcut', shortcut),
  getTabShortcuts: () => ipcRenderer.invoke('get-tab-shortcuts'),
  setTabShortcuts: (shortcuts) => ipcRenderer.invoke('set-tab-shortcuts', shortcuts),
  onCycleTab: (callback) => ipcRenderer.on('cycle-tab', callback),
  onSwitchToTab: (callback) => ipcRenderer.on('switch-to-tab', (event, index) => callback(index)),
  backupConfig: () => ipcRenderer.invoke('backup-config'),
  restoreConfig: () => ipcRenderer.invoke('restore-config'),
  updateWebviewNavigationMode: (webContentsId, navigationMode, widgetUrl) =>
    ipcRenderer.send('update-webview-navigation-mode', webContentsId, navigationMode, widgetUrl)
});
