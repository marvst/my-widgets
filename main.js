const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const AutoLaunch = require('auto-launch');

let mainWindow;
let tray = null;
let isModalOpen = false;
let STORAGE_PATH;
// Store navigation mode for each webview by webContentsId
const webviewNavigationModes = new Map();
let SETTINGS_PATH;
let autoLauncher;
let currentShortcut = 'CommandOrControl+Shift+Space';
let currentTabCycleShortcut = 'CommandOrControl+Tab';
let tabsData = { tabs: [], currentTabId: null }; // Cache of tabs data for shortcut handling
let privacyModeEnabled = true; // Default to enabled for security
let compactMode = false; // Default to disabled for normal spacing

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

  // Enable/disable content protection based on privacy mode setting
  mainWindow.setContentProtection(privacyModeEnabled);

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

    // Get webview element attributes and store them
    mainWindow.webContents.executeJavaScript(`
      (() => {
        const webviews = document.querySelectorAll('webview');
        for (const wv of webviews) {
          if (wv.getWebContentsId && wv.getWebContentsId() === ${webContents.id}) {
            return {
              navigationMode: wv.getAttribute('data-navigation-mode') || 'same-domain',
              widgetUrl: wv.getAttribute('data-widget-url') || wv.src
            };
          }
        }
        return { navigationMode: 'same-domain', widgetUrl: '' };
      })();
    `).then(result => {
      webviewNavigationModes.set(webContents.id, result);
      console.log(`Webview ${webContents.id} navigation mode: ${result.navigationMode}, URL: ${result.widgetUrl}`);
    }).catch(err => {
      console.error('Failed to get webview attributes:', err);
      webviewNavigationModes.set(webContents.id, { navigationMode: 'same-domain', widgetUrl: '' });
    });

    // Intercept navigation in webviews
    webContents.setWindowOpenHandler(({ url }) => {
      console.log('[MAIN] setWindowOpenHandler - opening in browser:', url);
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // Track if this is the first navigation (initial page load)
    let isInitialLoad = true;

    // Handle navigation attempts
    webContents.on('will-navigate', (event, url) => {
      console.log('[MAIN] will-navigate event fired:', url);

      // Allow the initial page load without any checks
      if (isInitialLoad) {
        isInitialLoad = false;
        console.log('[MAIN] Initial load allowed:', url);
        return;
      }

      // Get stored navigation mode
      const config = webviewNavigationModes.get(webContents.id) || { navigationMode: 'internal', widgetUrl: '' };
      let { navigationMode } = config;

      // Treat 'same-domain' as 'internal' for backwards compatibility
      if (navigationMode === 'same-domain') {
        navigationMode = 'internal';
      }

      console.log(`[MAIN] Navigation mode: ${navigationMode}`);

      // If mode is 'external', open all navigation in browser
      if (navigationMode === 'external') {
        console.log('[MAIN] External mode - PREVENTING navigation and opening in browser:', url);
        event.preventDefault();
        // Open in external browser
        shell.openExternal(url);
        // Also try to reload the original page to keep widget locked
        const originalUrl = config.widgetUrl;
        if (originalUrl) {
          console.log('[MAIN] Reloading widget to original URL:', originalUrl);
          // Small delay to ensure preventDefault takes effect first
          setTimeout(() => {
            try {
              webContents.loadURL(originalUrl);
            } catch (err) {
              console.error('[MAIN] Failed to reload original URL:', err);
            }
          }, 100);
        }
        return;
      }

      // If mode is 'internal' (or 'same-domain' for backwards compat), allow all navigation in widget
      console.log('[MAIN] Internal mode - navigation ALLOWED within widget');
      // Don't preventDefault - let the navigation proceed normally
    });

    // Clean up when webContents is destroyed
    webContents.on('destroyed', () => {
      webviewNavigationModes.delete(webContents.id);
    });

    // Forward keyboard shortcuts from webview to main window
    webContents.on('before-input-event', (event, input) => {
      // Forward Ctrl+Shift+Space to toggle overlay
      if (input.type === 'keyDown' &&
          input.key === ' ' &&
          input.shift &&
          (input.control || input.meta)) {
        event.preventDefault();
        fadeOutWindow(() => {
          mainWindow.hide();
        });
      }

      // Forward tab cycle shortcut (Ctrl+Tab by default)
      if (input.type === 'keyDown' && inputMatchesShortcut(input, currentTabCycleShortcut)) {
        event.preventDefault();
        mainWindow.webContents.send('cycle-tab');
      }

      // Forward tab-specific shortcuts
      if (input.type === 'keyDown' && tabsData.tabs) {
        for (let i = 0; i < tabsData.tabs.length; i++) {
          const tab = tabsData.tabs[i];
          if (tab.shortcut && inputMatchesShortcut(input, tab.shortcut)) {
            event.preventDefault();
            mainWindow.webContents.send('switch-to-tab', i);
            break;
          }
        }
      }
    });
  });

  // Show window only after content is loaded
  mainWindow.once('ready-to-show', () => {
    // Ensure full screen size and show instantly
    mainWindow.setBounds({ x, y, width, height });
    mainWindow.setOpacity(1);
    mainWindow.show();
  });

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();

  // Handle keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Handle ESC key to hide window
    if (input.key === 'Escape' && input.type === 'keyDown') {
      event.preventDefault();
      fadeOutWindow(() => {
        mainWindow.hide();
      });
    }

    // Handle tab cycle shortcut (Ctrl+Tab by default)
    if (input.type === 'keyDown' && inputMatchesShortcut(input, currentTabCycleShortcut)) {
      event.preventDefault();
      mainWindow.webContents.send('cycle-tab');
    }

    // Handle tab-specific shortcuts
    if (input.type === 'keyDown' && tabsData.tabs) {
      for (let i = 0; i < tabsData.tabs.length; i++) {
        const tab = tabsData.tabs[i];
        if (tab.shortcut && inputMatchesShortcut(input, tab.shortcut)) {
          event.preventDefault();
          mainWindow.webContents.send('switch-to-tab', i);
          break;
        }
      }
    }

    // Handle global toggle shortcut (Ctrl+Shift+Space) even when webview is focused
    if (input.type === 'keyDown' &&
        input.key === ' ' &&
        input.shift &&
        (input.control || input.meta)) {
      event.preventDefault();
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

// Fade out animation for window
function fadeOutWindow(callback) {
  if (!mainWindow) return;

  const steps = 5; // Number of animation steps
  const duration = 50; // Total duration in ms
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

      // Set bounds and opacity before showing to prevent glitch
      mainWindow.setBounds({ x, y, width, height });
      mainWindow.setOpacity(1);
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

  // Register global shortcuts
  registerToggleShortcut(currentShortcut);
  // Tab cycle and specific tab shortcuts are handled via before-input-event (window-local, not global)

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
    tabsData = JSON.parse(data);
    return tabsData;
  } catch (error) {
    // If file doesn't exist, return empty structure
    tabsData = { tabs: [], currentTabId: null };
    return tabsData;
  }
});

ipcMain.handle('save-tabs', async (event, data) => {
  try {
    await fs.writeFile(STORAGE_PATH, JSON.stringify(data, null, 2));
    tabsData = data; // Update cache
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

// IPC handler for updating webview navigation mode
ipcMain.on('update-webview-navigation-mode', (event, webContentsId, navigationMode, widgetUrl) => {
  console.log(`[MAIN] Updating navigation mode for webview ${webContentsId} to ${navigationMode}`);
  webviewNavigationModes.set(webContentsId, { navigationMode, widgetUrl });
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

// IPC handlers for privacy mode
ipcMain.handle('get-privacy-mode', async () => {
  try {
    return { success: true, enabled: privacyModeEnabled };
  } catch (error) {
    console.error('Error getting privacy mode:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-privacy-mode', async (event, enabled) => {
  try {
    privacyModeEnabled = enabled;

    // Apply to the window immediately
    if (mainWindow) {
      mainWindow.setContentProtection(enabled);
    }

    // Save to settings file
    let settings = {};
    try {
      const data = await fs.readFile(SETTINGS_PATH, 'utf8');
      settings = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, use empty object
    }
    settings.privacyMode = enabled;
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));

    console.log(`Privacy mode ${enabled ? 'enabled' : 'disabled'}`);
    return { success: true };
  } catch (error) {
    console.error('Error setting privacy mode:', error);
    return { success: false, error: error.message };
  }
});

// IPC handlers for compact mode
ipcMain.handle('get-compact-mode', async () => {
  try {
    return { success: true, enabled: compactMode };
  } catch (error) {
    console.error('Error getting compact mode:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-compact-mode', async (event, enabled) => {
  try {
    compactMode = enabled;

    // Save to settings file
    let settings = {};
    try {
      const data = await fs.readFile(SETTINGS_PATH, 'utf8');
      settings = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, use empty object
    }
    settings.compactMode = enabled;
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));

    console.log(`Compact mode ${enabled ? 'enabled' : 'disabled'}`);
    return { success: true };
  } catch (error) {
    console.error('Error setting compact mode:', error);
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
    if (settings.tabCycleShortcut) {
      currentTabCycleShortcut = settings.tabCycleShortcut;
      console.log('Loaded tab cycle shortcut:', currentTabCycleShortcut);
    }
    if (settings.privacyMode !== undefined) {
      privacyModeEnabled = settings.privacyMode;
      console.log('Loaded privacy mode:', privacyModeEnabled);
    }
    if (settings.compactMode !== undefined) {
      compactMode = settings.compactMode;
      console.log('Loaded compact mode:', compactMode);
    }
  } catch (error) {
    // File doesn't exist or is invalid, use defaults
    console.log('Using default shortcuts and settings');
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

// Save tab shortcuts to settings
async function saveTabShortcuts(tabCycleShortcut) {
  try {
    let settings = {};
    try {
      const data = await fs.readFile(SETTINGS_PATH, 'utf8');
      settings = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, use empty object
    }
    settings.tabCycleShortcut = tabCycleShortcut;
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (error) {
    console.error('Error saving tab shortcuts:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to check if input matches a shortcut string
function inputMatchesShortcut(input, shortcut) {
  const parts = shortcut.split('+');
  const modifiers = {
    control: false,
    meta: false,
    alt: false,
    shift: false
  };
  let key = '';

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'commandorcontrol' || lower === 'ctrl' || lower === 'control') {
      modifiers.control = true;
      modifiers.meta = true; // CommandOrControl means either
    } else if (lower === 'alt') {
      modifiers.alt = true;
    } else if (lower === 'shift') {
      modifiers.shift = true;
    } else if (lower === 'meta' || lower === 'cmd' || lower === 'command') {
      modifiers.meta = true;
    } else {
      key = part.toLowerCase();
    }
  }

  // Check if modifiers match
  const controlMatch = modifiers.control ? (input.control || input.meta) : (!input.control && !input.meta);
  const altMatch = modifiers.alt ? input.alt : !input.alt;
  const shiftMatch = modifiers.shift ? input.shift : !input.shift;

  // Check if key matches
  const inputKey = input.key.toLowerCase();
  const keyMatch = inputKey === key ||
                   (key === 'space' && inputKey === ' ') ||
                   (key === 'tab' && inputKey === 'tab');

  return controlMatch && altMatch && shiftMatch && keyMatch;
}

// Register toggle shortcut
function registerToggleShortcut(shortcut) {
  try {
    // Unregister only the previous toggle shortcut if it's different
    if (globalShortcut.isRegistered(currentShortcut) && currentShortcut !== shortcut) {
      globalShortcut.unregister(currentShortcut);
    }

    console.log('Attempting to register toggle shortcut:', shortcut);

    // Register new shortcut
    const ret = globalShortcut.register(shortcut, () => {
      toggleWindow();
    });

    if (!ret) {
      console.error('Global shortcut registration failed for:', shortcut);
      return false;
    }

    console.log('Global shortcut registered successfully:', shortcut);
    return true;
  } catch (error) {
    console.error('Exception while registering shortcut:', shortcut, error);
    throw error;
  }
}

// Tab cycle and specific tab shortcuts are now handled via before-input-event (window-local)
// This keeps them consistent with Ctrl+Tab behavior and allows user configuration

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

// IPC handlers for tab shortcuts
ipcMain.handle('get-tab-shortcuts', async () => {
  return {
    tabCycleShortcut: currentTabCycleShortcut
  };
});

ipcMain.handle('set-tab-shortcuts', async (event, shortcuts) => {
  try {
    // Validate shortcuts format
    if (!shortcuts || typeof shortcuts !== 'object') {
      return { success: false, error: 'Invalid shortcuts format' };
    }

    const { tabCycleShortcut } = shortcuts;

    // Validate tab cycle shortcut if provided
    if (tabCycleShortcut && typeof tabCycleShortcut !== 'string') {
      return { success: false, error: 'Invalid tab cycle shortcut format' };
    }

    // Update tab cycle shortcut if changed
    if (tabCycleShortcut && tabCycleShortcut !== currentTabCycleShortcut) {
      currentTabCycleShortcut = tabCycleShortcut;
    }

    // Save to settings
    await saveTabShortcuts(currentTabCycleShortcut);

    return { success: true };
  } catch (error) {
    console.error('Error setting tab shortcuts:', error);
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

// IPC handler for backup configuration
ipcMain.handle('backup-config', async () => {
  try {
    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Backup Configuration',
      defaultPath: `overlay-deck-backup-${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.json`,
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    // Read current configuration
    const tabs = await fs.readFile(STORAGE_PATH, 'utf8').catch(() => '{"tabs":[],"currentTabId":null}');
    const settings = await fs.readFile(SETTINGS_PATH, 'utf8').catch(() => '{}');

    // Create backup object
    const backup = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      tabs: JSON.parse(tabs),
      settings: JSON.parse(settings)
    };

    // Write to selected file
    await fs.writeFile(result.filePath, JSON.stringify(backup, null, 2));

    return { success: true, filePath: result.filePath };
  } catch (error) {
    console.error('Error backing up configuration:', error);
    return { success: false, error: error.message };
  }
});

// IPC handler for restore configuration
ipcMain.handle('restore-config', async () => {
  try {
    // Show open dialog
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Restore Configuration',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    // Read backup file
    const backupData = await fs.readFile(result.filePaths[0], 'utf8');
    const backup = JSON.parse(backupData);

    // Validate backup structure
    if (!backup.tabs || !backup.settings) {
      return { success: false, error: 'Invalid backup file format' };
    }

    // Save tabs
    await fs.writeFile(STORAGE_PATH, JSON.stringify(backup.tabs, null, 2));

    // Save settings
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(backup.settings, null, 2));

    // Load the new shortcut if it exists
    if (backup.settings.shortcut) {
      currentShortcut = backup.settings.shortcut;
      registerToggleShortcut(currentShortcut);
      updateTrayMenu();
    }

    return { success: true, filePath: result.filePaths[0] };
  } catch (error) {
    console.error('Error restoring configuration:', error);
    return { success: false, error: error.message };
  }
});
