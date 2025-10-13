const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;
let tray = null;
const STORAGE_PATH = path.join(app.getPath('userData'), 'widgets.json');

function createWindow() {
  // Get the display where the cursor is currently located
  const cursorPoint = screen.getCursorScreenPoint();
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const { x, y, width, height } = activeDisplay.workArea;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    }
  });

  mainWindow.loadFile('renderer/index.html');

  // Maximize the window to fill the entire screen
  mainWindow.maximize();

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();

  // Handle ESC key to close
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      mainWindow.hide();
    }
  });

  // Prevent window from closing, just hide it instead
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Toggle window visibility
function toggleWindow() {
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      // Move window to the screen where the cursor is currently located
      const cursorPoint = screen.getCursorScreenPoint();
      const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
      const { x, y, width, height } = activeDisplay.workArea;

      mainWindow.setBounds({ x, y, width, height });
      mainWindow.show();
      mainWindow.maximize();
      mainWindow.focus();
    }
  }
}

function createTray() {
  // Use the icon.png file for the tray icon
  const iconPath = path.join(__dirname, 'icon.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Overlay',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Toggle Overlay (Ctrl+Shift+Space)',
      click: () => {
        toggleWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Overlay Widgets');
  tray.setContextMenu(contextMenu);

  // Double click to toggle window
  tray.on('double-click', () => {
    toggleWindow();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Register global shortcut to toggle overlay (Ctrl+Shift+Space)
  const ret = globalShortcut.register('CommandOrControl+Shift+Space', () => {
    toggleWindow();
  });

  if (!ret) {
    console.log('Global shortcut registration failed');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Prevent app from quitting when window is closed
  // App will stay in tray instead
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
});

// IPC handlers for widget management
ipcMain.handle('get-widgets', async () => {
  try {
    const data = await fs.readFile(STORAGE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return empty array
    return [];
  }
});

ipcMain.handle('save-widgets', async (event, widgets) => {
  try {
    await fs.writeFile(STORAGE_PATH, JSON.stringify(widgets, null, 2));
    return { success: true };
  } catch (error) {
    console.error('Error saving widgets:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('add-widget', async (event, widget) => {
  try {
    let widgets = [];
    try {
      const data = await fs.readFile(STORAGE_PATH, 'utf8');
      widgets = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet
    }

    widgets.push({
      id: Date.now().toString(),
      name: widget.name,
      url: widget.url,
      width: widget.width || 30,  // Default to 30% width
      height: widget.height || 40  // Default to 40% height
    });

    await fs.writeFile(STORAGE_PATH, JSON.stringify(widgets, null, 2));
    return { success: true, widgets };
  } catch (error) {
    console.error('Error adding widget:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('remove-widget', async (event, widgetId) => {
  try {
    const data = await fs.readFile(STORAGE_PATH, 'utf8');
    let widgets = JSON.parse(data);
    widgets = widgets.filter(w => w.id !== widgetId);

    await fs.writeFile(STORAGE_PATH, JSON.stringify(widgets, null, 2));
    return { success: true, widgets };
  } catch (error) {
    console.error('Error removing widget:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-widget-size', async (event, widgetId, width, height) => {
  try {
    const data = await fs.readFile(STORAGE_PATH, 'utf8');
    let widgets = JSON.parse(data);

    const widget = widgets.find(w => w.id === widgetId);
    if (widget) {
      widget.width = width;
      widget.height = height;
      await fs.writeFile(STORAGE_PATH, JSON.stringify(widgets, null, 2));
      return { success: true, widgets };
    }

    return { success: false, error: 'Widget not found' };
  } catch (error) {
    console.error('Error updating widget size:', error);
    return { success: false, error: error.message };
  }
});
