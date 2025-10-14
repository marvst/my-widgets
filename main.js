const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;
let tray = null;
let isModalOpen = false;
const STORAGE_PATH = path.join(app.getPath('userData'), 'tabs.json');

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
    show: false, // Don't show until ready
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    }
  });

  // Set bounds to full screen immediately before loading
  mainWindow.setBounds({ x, y, width, height });

  mainWindow.loadFile('renderer/index.html');

  // Show window only after content is loaded
  mainWindow.once('ready-to-show', () => {
    // Ensure full screen size and show without animation
    mainWindow.setBounds({ x, y, width, height });
    mainWindow.show();
  });

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();

  // Handle ESC key to hide window
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

      // Set bounds before showing to prevent resize animation
      mainWindow.setBounds({ x, y, width, height });
      mainWindow.show();
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

  // Register global shortcut for tab switching (Ctrl+Tab)
  const tabSwitchRet = globalShortcut.register('CommandOrControl+Tab', () => {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.webContents.send('switch-next-tab');
    }
  });

  if (!tabSwitchRet) {
    console.log('Ctrl+Tab shortcut registration failed');
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

// IPC handlers for tabs management
ipcMain.handle('get-tabs', async () => {
  try {
    const data = await fs.readFile(STORAGE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return empty structure
    return { tabs: [], currentTabId: null };
  }
});

ipcMain.handle('save-tabs', async (event, data) => {
  try {
    await fs.writeFile(STORAGE_PATH, JSON.stringify(data, null, 2));
    return { success: true };
  } catch (error) {
    console.error('Error saving tabs:', error);
    return { success: false, error: error.message };
  }
});

// IPC handler for modal state
ipcMain.on('set-modal-state', (event, isOpen) => {
  isModalOpen = isOpen;
  console.log('Modal state updated:', isModalOpen ? 'open' : 'closed');
});
