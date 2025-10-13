const { contextBridge, ipcRenderer, shell } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getWidgets: () => ipcRenderer.invoke('get-widgets'),
  saveWidgets: (widgets) => ipcRenderer.invoke('save-widgets', widgets),
  addWidget: (widget) => ipcRenderer.invoke('add-widget', widget),
  removeWidget: (widgetId) => ipcRenderer.invoke('remove-widget', widgetId),
  updateWidgetSize: (widgetId, width, height) => ipcRenderer.invoke('update-widget-size', widgetId, width, height),
  openExternal: (url) => shell.openExternal(url)
});
