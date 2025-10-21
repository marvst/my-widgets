const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const AutoLaunch = require('auto-launch');

let mainWindow;
let tray = null;
let isModalOpen = false;
let STORAGE_PATH;
let SETTINGS_PATH;
let autoLauncher;
let currentShortcut = 'CommandOrControl+Shift+Space';

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
    skipTaskbar: true, // Don't show in taskbar
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

  // Enable content protection to prevent the window from being captured in screen sharing
  mainWindow.setContentProtection(true);

  mainWindow.loadFile('renderer/index.html');

  // Intercept all new window requests and open in external browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('Window open handler - opening in browser:', url);
    shell.openExternal(url);
    return { action: 'deny' }; // Prevent window from opening in Electron
  });

  // Handle webview new-window events
  mainWindow.webContents.on('did-attach-webview', (event, webContents) => {
    console.log('Webview attached');

    // Intercept navigation in webviews
    webContents.setWindowOpenHandler(({ url }) => {
      console.log('Webview window open - opening in browser:', url);
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // Handle navigation attempts
    webContents.on('will-navigate', (event, url) => {
      // Get the webview's current URL
      const currentUrl = webContents.getURL();
      // Only intercept if navigating away from the current page
      if (url !== currentUrl) {
        console.log('Webview navigation intercepted - opening in browser:', url);
        event.preventDefault();
        shell.openExternal(url);
      }
    });
  });

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
      fadeOutWindow(() => {
        mainWindow.hide();
      });
    }
  });

  // Prevent window from closing, just hide it instead
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      fadeOutWindow(() => {
        mainWindow.hide();
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Fade in animation for window
function fadeInWindow() {
  if (!mainWindow) return;

  const steps = 20; // Number of animation steps
  const duration = 300; // Total duration in ms
  const interval = duration / steps;
  let currentStep = 0;

  mainWindow.setOpacity(0);

  const fadeInterval = setInterval(() => {
    currentStep++;
    const opacity = currentStep / steps;
    mainWindow.setOpacity(opacity);

    if (currentStep >= steps) {
      clearInterval(fadeInterval);
      mainWindow.setOpacity(1);
    }
  }, interval);
}

// Fade out animation for window
function fadeOutWindow(callback) {
  if (!mainWindow) return;

  const steps = 15; // Number of animation steps
  const duration = 100; // Total duration in ms
  const interval = duration / steps;
  let currentStep = steps;

  const fadeInterval = setInterval(() => {
    currentStep--;
    const opacity = currentStep / steps;
    mainWindow.setOpacity(opacity);

    if (currentStep <= 0) {
      clearInterval(fadeInterval);
      mainWindow.setOpacity(0);
      if (callback) callback();
    }
  }, interval);
}

// Toggle window visibility
function toggleWindow() {
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      fadeOutWindow(() => {
        mainWindow.hide();
      });
    } else {
      // Move window to the screen where the cursor is currently located
      const cursorPoint = screen.getCursorScreenPoint();
      const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
      const { x, y, width, height } = activeDisplay.workArea;

      // Set bounds before showing to prevent resize animation
      mainWindow.setBounds({ x, y, width, height });
      mainWindow.show();
      mainWindow.focus();

      // Fade in the window
      fadeInWindow();
    }
  }
}

function createTray() {
  // Use the icon.png file for the tray icon
  const iconPath = path.join(__dirname, 'icon.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
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

  tray.setToolTip('Overlay Deck');
  tray.setContextMenu(contextMenu);

  // Double click to toggle window
  tray.on('double-click', () => {
    toggleWindow();
  });
}

app.whenReady().then(async () => {
  // Initialize paths and auto-launcher after app is ready
  STORAGE_PATH = path.join(app.getPath('userData'), 'tabs.json');
  SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
  autoLauncher = new AutoLaunch({
    name: 'Overlay Deck',
    path: app.getPath('exe'),
  });

  // Load saved shortcut
  await loadShortcut();

  createWindow();
  createTray();

  // Register global shortcut to toggle overlay
  registerToggleShortcut(currentShortcut);

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

// IPC handler for opening external URLs in system browser
ipcMain.handle('open-external', async (event, url) => {
  try {
    console.log('Opening external URL:', url);
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Error opening external URL:', error);
    return { success: false, error: error.message };
  }
});

// IPC handlers for auto-launch
ipcMain.handle('get-auto-launch-status', async () => {
  try {
    const isEnabled = await autoLauncher.isEnabled();
    return { success: true, enabled: isEnabled };
  } catch (error) {
    console.error('Error checking auto-launch status:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-auto-launch', async (event, enabled) => {
  try {
    if (enabled) {
      await autoLauncher.enable();
    } else {
      await autoLauncher.disable();
    }
    return { success: true };
  } catch (error) {
    console.error('Error setting auto-launch:', error);
    return { success: false, error: error.message };
  }
});

// Load shortcut from settings
async function loadShortcut() {
  try {
    const data = await fs.readFile(SETTINGS_PATH, 'utf8');
    const settings = JSON.parse(data);
    if (settings.shortcut) {
      currentShortcut = settings.shortcut;
      console.log('Loaded shortcut:', currentShortcut);
    }
  } catch (error) {
    // File doesn't exist or is invalid, use default
    console.log('Using default shortcut:', currentShortcut);
  }
}

// Save shortcut to settings
async function saveShortcut(shortcut) {
  try {
    let settings = {};
    try {
      const data = await fs.readFile(SETTINGS_PATH, 'utf8');
      settings = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, use empty object
    }
    settings.shortcut = shortcut;
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (error) {
    console.error('Error saving shortcut:', error);
    return { success: false, error: error.message };
  }
}

// Register toggle shortcut
function registerToggleShortcut(shortcut) {
  try {
    // Unregister previous shortcut if exists
    globalShortcut.unregisterAll();

    console.log('Attempting to register shortcut:', shortcut);

    // Register new shortcut
    const ret = globalShortcut.register(shortcut, () => {
      toggleWindow();
    });

    if (!ret) {
      console.error('Global shortcut registration failed for:', shortcut);
      return false;
    }

    // Re-register tab switching shortcut
    const tabSwitchRet = globalShortcut.register('CommandOrControl+Tab', () => {
      if (mainWindow && mainWindow.isVisible()) {
        mainWindow.webContents.send('switch-next-tab');
      }
    });

    if (!tabSwitchRet) {
      console.log('Ctrl+Tab shortcut registration failed');
    }

    console.log('Global shortcut registered successfully:', shortcut);
    return true;
  } catch (error) {
    console.error('Exception while registering shortcut:', shortcut, error);
    throw error;
  }
}

// IPC handlers for shortcut management
ipcMain.handle('get-shortcut', async () => {
  return currentShortcut;
});

ipcMain.handle('set-shortcut', async (event, shortcut) => {
  try {
    // Validate shortcut format
    if (!shortcut || typeof shortcut !== 'string') {
      return { success: false, error: 'Invalid shortcut format' };
    }

    // Try to register the new shortcut
    const registered = registerToggleShortcut(shortcut);

    if (!registered) {
      return { success: false, error: 'Failed to register shortcut. It may be in use by another application.' };
    }

    // Save to settings
    currentShortcut = shortcut;
    await saveShortcut(shortcut);

    // Update tray menu
    updateTrayMenu();

    return { success: true };
  } catch (error) {
    console.error('Error setting shortcut:', error);
    return { success: false, error: error.message };
  }
});

// Update tray menu with current shortcut
function updateTrayMenu() {
  if (!tray) return;

  const displayShortcut = currentShortcut.replace('CommandOrControl', 'Ctrl');
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Toggle Overlay (${displayShortcut})`,
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

  tray.setContextMenu(contextMenu);
}
