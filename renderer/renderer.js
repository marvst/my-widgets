// State
let tabs = [];
let currentTabId = null;

// DOM Elements
const widgetsContainer = document.getElementById('widgets-container');
const emptyState = document.getElementById('empty-state');
const modalOverlay = document.getElementById('modal-overlay');
const addWidgetModal = document.getElementById('add-widget-modal');
const addWidgetForm = document.getElementById('add-widget-form');
const toggleAddPanelBtn = document.getElementById('toggle-add-panel');
const closeModalBtn = document.getElementById('close-modal');
const cancelAddBtn = document.getElementById('cancel-add');
const tabsList = document.getElementById('tabs-list');
const addTabBtn = document.getElementById('add-tab-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsModalBtn = document.getElementById('close-settings-modal');
const autoLaunchToggle = document.getElementById('auto-launch-toggle');
const privacyModeToggle = document.getElementById('privacy-mode-toggle');
const compactModeToggle = document.getElementById('compact-mode-toggle');
const tabContextMenu = document.getElementById('tab-context-menu');
const shortcutInput = document.getElementById('shortcut-input');
const resetShortcutBtn = document.getElementById('reset-shortcut-btn');
const editWidgetModal = document.getElementById('edit-widget-modal');
const editWidgetForm = document.getElementById('edit-widget-form');
const closeEditModalBtn = document.getElementById('close-edit-modal');
const cancelEditBtn = document.getElementById('cancel-edit');
const backupConfigBtn = document.getElementById('backup-config-btn');
const restoreConfigBtn = document.getElementById('restore-config-btn');
const settingsTabs = document.querySelectorAll('.settings-tab');
const tabCycleShortcutInput = document.getElementById('tab-cycle-shortcut-input');
const resetTabCycleShortcutBtn = document.getElementById('reset-tab-cycle-shortcut-btn');

// Context menu state
let contextMenuTargetTabId = null;

// Edit widget state
let editingWidgetId = null;

// Shortcut recording state
let isRecordingShortcut = false;
let isRecordingTabCycleShortcut = false;
let currentShortcut = 'CommandOrControl+Shift+Space';
let currentTabCycleShortcut = 'CommandOrControl+Tab';

// Compact mode header visibility state
let headerVisibilityTimeout = null;
const HEADER_HIDE_DELAY = 300;  // 300ms - matches show animation time
const HEADER_TAB_SWITCH_DELAY = 300;  // 300ms - matches show animation time
const HEADER_HOVER_THRESHOLD = 5;  // pixels from top

// Track modal state locally for header behavior
let isModalOpenLocal = false;

// Initialize
async function init() {
  await loadTabs();
  renderTabs();

  // Load and apply compact mode preference
  await loadCompactModeStatus();

  // If no tabs exist, create a default one
  if (tabs.length === 0) {
    await addTab('Tab 1');
  } else {
    // Set first tab as active if no active tab
    if (!currentTabId || !tabs.find(t => t.id === currentTabId)) {
      currentTabId = tabs[0].id;
    }
    switchTab(currentTabId);
  }

  setupEventListeners();

  // Listen for tab cycle shortcut from main process
  window.electronAPI.onCycleTab(() => {
    switchToNextTab();
  });

  // Listen for specific tab shortcuts (Alt+1-9) from main process
  window.electronAPI.onSwitchToTab((index) => {
    switchToTabByIndex(index);
  });
}

// Load tabs from storage
async function loadTabs() {
  try {
    const data = await window.electronAPI.getTabs();
    tabs = data.tabs || [];
    currentTabId = data.currentTabId || null;

    // Add default shortcuts to existing tabs that don't have them
    let needsSave = false;
    tabs.forEach((tab, index) => {
      if (tab.shortcut === undefined) {
        tab.shortcut = index < 9 ? `Alt+${index + 1}` : null;
        needsSave = true;
      }
    });

    if (needsSave) {
      await saveTabs();
    }

    console.log('Loaded tabs:', tabs);
  } catch (error) {
    console.error('Error loading tabs:', error);
    tabs = [];
    currentTabId = null;
  }
}

// Render tabs
function renderTabs() {
  tabsList.innerHTML = '';

  tabs.forEach(tab => {
    const tabElement = createTabElement(tab);
    tabsList.appendChild(tabElement);
  });
}

// Create tab element
function createTabElement(tab) {
  const tabDiv = document.createElement('div');
  tabDiv.className = 'tab';
  tabDiv.dataset.tabId = tab.id;
  tabDiv.title = 'Right-click for options';

  if (tab.id === currentTabId) {
    tabDiv.classList.add('active');
  }

  const tabName = document.createElement('input');
  tabName.className = 'tab-name-editable';
  tabName.type = 'text';
  tabName.value = tab.name;
  tabName.readOnly = true;

  // Double-click to edit tab name
  tabName.addEventListener('dblclick', (e) => {
    e.stopPropagation(); // Prevent tab click event
    tabName.readOnly = false;
    tabName.focus();
    tabName.select();
  });

  // Save on blur or Enter
  tabName.addEventListener('blur', () => {
    tabName.readOnly = true;
    if (tabName.value.trim()) {
      renameTab(tab.id, tabName.value.trim());
    } else {
      tabName.value = tab.name;
    }
  });

  tabName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      tabName.blur();
    } else if (e.key === 'Escape') {
      tabName.value = tab.name;
      tabName.blur();
    }
  });

  // Prevent input clicks from bubbling when editing
  tabName.addEventListener('click', (e) => {
    if (!tabName.readOnly) {
      e.stopPropagation();
    }
  });

  // Click to switch tab
  tabDiv.addEventListener('click', (e) => {
    // Don't switch if clicking on the input while editing
    if (e.target === tabName && !tabName.readOnly) return;
    // Don't switch if clicking on close button
    if (e.target.classList.contains('tab-close')) return;

    switchTab(tab.id);
  });

  // Right-click context menu
  tabDiv.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showTabContextMenu(e.pageX, e.pageY, tab.id);
  });

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.innerHTML = '×';
  closeBtn.title = 'Close tab';
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    removeTab(tab.id);
  };

  tabDiv.appendChild(tabName);

  // Only show close button if there's more than one tab
  if (tabs.length > 1) {
    tabDiv.appendChild(closeBtn);
  }

  return tabDiv;
}

// Switch to a tab
function switchTab(tabId) {
  currentTabId = tabId;
  renderTabs();
  renderWidgets();
  saveTabs();

  // Show header temporarily when switching tabs in compact mode
  if (document.body.classList.contains('compact-mode')) {
    showHeaderTemporarily(HEADER_TAB_SWITCH_DELAY);
  }
}

// Switch to next tab (with wrapping)
function switchToNextTab() {
  if (tabs.length === 0) return;

  const currentIndex = tabs.findIndex(t => t.id === currentTabId);
  const nextIndex = (currentIndex + 1) % tabs.length;

  switchTab(tabs[nextIndex].id);
  scrollTabIntoView(tabs[nextIndex].id);
}

// Switch to tab by index (0-based, for Alt+1-9 shortcuts)
function switchToTabByIndex(index) {
  if (tabs.length === 0 || index < 0 || index >= tabs.length) return;

  switchTab(tabs[index].id);
  scrollTabIntoView(tabs[index].id);
}

// Scroll tab into view
function scrollTabIntoView(tabId) {
  const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
  if (tabElement) {
    tabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

// Render all widgets for current tab
function renderWidgets() {
  const currentTab = tabs.find(t => t.id === currentTabId);

  // Handle empty state
  if (!currentTab || !currentTab.widgets || currentTab.widgets.length === 0) {
    emptyState.classList.remove('hidden');
    // Hide all widgets
    const allWidgets = widgetsContainer.querySelectorAll('.widget');
    allWidgets.forEach(w => w.style.display = 'none');
    return;
  }

  emptyState.classList.add('hidden');

  // Show/hide widgets based on current tab
  // Instead of destroying and recreating, we keep them in DOM
  tabs.forEach(tab => {
    if (!tab.widgets) return;

    tab.widgets.forEach(widget => {
      let widgetElement = document.querySelector(`[data-widget-id="${widget.id}"]`);

      // Create widget element if it doesn't exist yet
      if (!widgetElement) {
        widgetElement = createWidgetElement(widget);
        widgetsContainer.appendChild(widgetElement);
      }

      // Show/hide based on current tab
      if (tab.id === currentTabId) {
        widgetElement.style.display = 'flex';
      } else {
        widgetElement.style.display = 'none';
      }
    });
  });

  // Focus the auto-focus widget if one is set
  focusAutoFocusWidget();
}

// Track last focused tab to prevent repeated auto-focus
let lastAutoFocusedTab = null;

// Focus the widget marked as auto-focus in current tab
function focusAutoFocusWidget() {
  const currentTab = tabs.find(t => t.id === currentTabId);
  if (!currentTab) return;

  // Only auto-focus once per tab switch, not on every render
  if (lastAutoFocusedTab === currentTabId) return;

  const autoFocusWidget = currentTab.widgets.find(w => w.autoFocus);
  if (!autoFocusWidget) {
    lastAutoFocusedTab = currentTabId;
    return;
  }

  // Find the webview for this widget and focus it
  const widgetElement = document.querySelector(`[data-widget-id="${autoFocusWidget.id}"]`);
  if (widgetElement) {
    const webview = widgetElement.querySelector('webview');
    if (webview) {
      webview.focus();
      console.log(`Auto-focused widget: ${autoFocusWidget.name}`);
      lastAutoFocusedTab = currentTabId;
    }
  }
}

// Create a widget DOM element
function createWidgetElement(widget) {
  const widgetDiv = document.createElement('div');
  widgetDiv.className = 'widget';
  widgetDiv.dataset.widgetId = widget.id;

  // Store percentage values as data attributes
  widgetDiv.dataset.widthPercent = typeof widget.width === 'number' ? widget.width : 100;
  widgetDiv.dataset.heightPercent = typeof widget.height === 'number' ? widget.height : 100;

  // Handle full width/height
  if (widget.width === 100 || widget.width === '100%') {
    widgetDiv.classList.add('widget-full-width');
  }
  if (widget.height === 100 || widget.height === '100%') {
    widgetDiv.classList.add('widget-full-height');
  }

  // Create widget header
  const header = document.createElement('div');
  header.className = 'widget-header';

  const titleContainer = document.createElement('div');
  titleContainer.className = 'widget-title-container';

  const title = document.createElement('span');
  title.className = 'widget-title';
  title.textContent = widget.name;
  title.title = widget.name; // Tooltip for full name

  const url = document.createElement('span');
  url.className = 'widget-url';
  url.textContent = truncateUrl(widget.url);
  url.title = widget.url; // Tooltip for full URL

  titleContainer.appendChild(title);
  titleContainer.appendChild(url);

  // Navigation controls (back, forward, refresh)
  const navControls = document.createElement('div');
  navControls.className = 'nav-controls';

  const backBtn = document.createElement('button');
  backBtn.className = 'nav-btn';
  backBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';
  backBtn.title = 'Go back';
  backBtn.disabled = true;

  const forwardBtn = document.createElement('button');
  forwardBtn.className = 'nav-btn';
  forwardBtn.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';
  forwardBtn.title = 'Go forward';
  forwardBtn.disabled = true;

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'nav-btn';
  refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
  refreshBtn.title = 'Refresh';

  navControls.appendChild(backBtn);
  navControls.appendChild(forwardBtn);
  navControls.appendChild(refreshBtn);

  // Create cog menu button
  const menuButton = document.createElement('button');
  menuButton.className = 'widget-menu-btn';
  menuButton.innerHTML = '<i class="fa-solid fa-cog"></i>';
  menuButton.title = 'Widget menu';
  menuButton.setAttribute('aria-label', 'Widget menu');

  // Create menu dropdown
  const menuDropdown = document.createElement('div');
  menuDropdown.className = 'widget-menu-dropdown hidden';

  // Edit menu item
  const editMenuItem = document.createElement('div');
  editMenuItem.className = 'widget-menu-item';
  editMenuItem.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit';
  editMenuItem.title = 'Edit widget name and URL';
  editMenuItem.onclick = (e) => {
    e.stopPropagation();
    showEditWidgetModal(widget.id);
    closeWidgetMenu(menuDropdown);
  };

  // Auto-focus menu item
  const autoFocusMenuItem = document.createElement('div');
  autoFocusMenuItem.className = 'widget-menu-item widget-auto-focus-item';
  const autoFocusIcon = widget.autoFocus ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
  const autoFocusText = widget.autoFocus ? 'Auto-focus (enabled)' : 'Auto-focus (disabled)';
  autoFocusMenuItem.innerHTML = autoFocusIcon + ' ' + autoFocusText;
  autoFocusMenuItem.title = widget.autoFocus ? 'Auto-focus is enabled' : 'Enable auto-focus on tab open';
  if (widget.autoFocus) autoFocusMenuItem.classList.add('active');
  autoFocusMenuItem.onclick = async (e) => {
    e.stopPropagation();
    await toggleAutoFocus(widget.id);
    // Update the menu to reflect the new state
    const currentTab = tabs.find(t => t.id === currentTabId);
    if (currentTab) {
      const widgetData = currentTab.widgets.find(w => w.id === widget.id);
      if (widgetData) {
        const newIcon = widgetData.autoFocus ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
        const newText = widgetData.autoFocus ? 'Auto-focus (enabled)' : 'Auto-focus (disabled)';
        autoFocusMenuItem.innerHTML = newIcon + ' ' + newText;
        if (widgetData.autoFocus) {
          autoFocusMenuItem.classList.add('active');
        } else {
          autoFocusMenuItem.classList.remove('active');
        }
      }
    }
  };

  // Remove menu item
  const removeMenuItem = document.createElement('div');
  removeMenuItem.className = 'widget-menu-item widget-menu-item-danger';
  removeMenuItem.innerHTML = '<i class="fa-solid fa-trash"></i> Remove';
  removeMenuItem.title = 'Remove this widget';
  removeMenuItem.onclick = (e) => {
    e.stopPropagation();
    removeWidget(widget.id);
    closeWidgetMenu(menuDropdown);
  };

  // Build the dropdown menu
  menuDropdown.appendChild(editMenuItem);
  menuDropdown.appendChild(autoFocusMenuItem);

  // Create wrapper for menu button and dropdown
  const actions = document.createElement('div');
  actions.className = 'widget-actions';
  actions.appendChild(menuButton);
  actions.appendChild(menuDropdown);

  // Toggle menu on button click
  menuButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleWidgetMenu(menuDropdown);
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!menuDropdown.classList.contains('hidden') &&
        !menuDropdown.contains(e.target) &&
        !menuButton.contains(e.target)) {
      closeWidgetMenu(menuDropdown);
    }
  });

  // Create a wrapper for nav controls and actions to keep them together on the right
  const controlsWrapper = document.createElement('div');
  controlsWrapper.style.display = 'flex';
  controlsWrapper.style.alignItems = 'center';
  controlsWrapper.style.marginLeft = 'auto';
  controlsWrapper.style.gap = '8px';
  controlsWrapper.appendChild(navControls);
  controlsWrapper.appendChild(actions);

  header.appendChild(titleContainer);
  header.appendChild(controlsWrapper);

  // Create widget content
  const content = document.createElement('div');
  content.className = 'widget-content';

  const widthPercent = typeof widget.width === 'number' ? widget.width : 100;
  const heightPercent = typeof widget.height === 'number' ? widget.height : 100;

  // Calculate grid spans (10 columns, each 10% wide)
  const columnSpan = Math.round(widthPercent / 10);
  // Calculate row spans (each row is 10vh)
  const rowSpan = Math.round(heightPercent / 10);

  // Apply grid positioning
  widgetDiv.style.gridColumn = `span ${columnSpan}`;
  widgetDiv.style.gridRow = `span ${rowSpan}`;

  // Create width menu item
  const widthMenuItem = document.createElement('div');
  widthMenuItem.className = 'widget-menu-item widget-menu-size-item';
  widthMenuItem.innerHTML = '<i class="fa-solid fa-arrows-left-right"></i> Width:';

  const widthSelector = document.createElement('select');
  widthSelector.className = 'menu-size-selector';
  widthSelector.title = 'Select width';

  const widthOptions = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  widthOptions.forEach(percent => {
    const option = document.createElement('option');
    option.value = percent;
    option.textContent = `${percent}%`;
    if (percent === widthPercent) {
      option.selected = true;
    }
    widthSelector.appendChild(option);
  });

  // Handle width change
  widthSelector.addEventListener('change', async (e) => {
    const newWidthPercent = parseInt(e.target.value);

    // Calculate and apply new grid column span
    const newColumnSpan = Math.round(newWidthPercent / 10);
    widgetDiv.style.gridColumn = `span ${newColumnSpan}`;
    widgetDiv.dataset.widthPercent = newWidthPercent;

    // Update full-width class
    if (newWidthPercent === 100) {
      widgetDiv.classList.add('widget-full-width');
    } else {
      widgetDiv.classList.remove('widget-full-width');
    }

    // Save to storage
    const currentTab = tabs.find(t => t.id === currentTabId);
    if (currentTab) {
      const widgetInTab = currentTab.widgets.find(w => w.id === widget.id);
      if (widgetInTab) {
        widgetInTab.width = newWidthPercent;
        await saveTabs();
        console.log(`Widget ${widget.id} width updated to ${newWidthPercent}%`);
      }
    }
  });

  widthMenuItem.appendChild(widthSelector);
  widthMenuItem.onclick = (e) => e.stopPropagation();

  // Create height menu item
  const heightMenuItem = document.createElement('div');
  heightMenuItem.className = 'widget-menu-item widget-menu-size-item';
  heightMenuItem.innerHTML = '<i class="fa-solid fa-arrows-up-down"></i> Height:';

  const heightSelector = document.createElement('select');
  heightSelector.className = 'menu-size-selector';
  heightSelector.title = 'Select height';

  const heightOptions = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  heightOptions.forEach(percent => {
    const option = document.createElement('option');
    option.value = percent;
    option.textContent = `${percent}%`;
    if (percent === heightPercent) {
      option.selected = true;
    }
    heightSelector.appendChild(option);
  });

  // Handle height change
  heightSelector.addEventListener('change', async (e) => {
    const newHeightPercent = parseInt(e.target.value);

    // Calculate and apply new grid row span
    const newRowSpan = Math.round(newHeightPercent / 10);
    widgetDiv.style.gridRow = `span ${newRowSpan}`;
    widgetDiv.dataset.heightPercent = newHeightPercent;

    // Update full-height class
    if (newHeightPercent === 100) {
      widgetDiv.classList.add('widget-full-height');
    } else {
      widgetDiv.classList.remove('widget-full-height');
    }

    // Save to storage
    const currentTab = tabs.find(t => t.id === currentTabId);
    if (currentTab) {
      const widgetInTab = currentTab.widgets.find(w => w.id === widget.id);
      if (widgetInTab) {
        widgetInTab.height = newHeightPercent;
        await saveTabs();
        console.log(`Widget ${widget.id} height updated to ${newHeightPercent}%`);
      }
    }
  });

  heightMenuItem.appendChild(heightSelector);
  heightMenuItem.onclick = (e) => e.stopPropagation();

  // Add size items to menu dropdown
  menuDropdown.appendChild(widthMenuItem);
  menuDropdown.appendChild(heightMenuItem);
  menuDropdown.appendChild(removeMenuItem);

  // Create webview for the website
  const webview = document.createElement('webview');
  webview.src = widget.url;
  webview.style.width = '100%';
  webview.style.height = '100%';
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('data-navigation-mode', widget.navigationMode || 'same-domain');
  webview.setAttribute('data-widget-url', widget.url);

  // Webview event handlers
  webview.addEventListener('did-start-loading', () => {
    console.log(`Loading: ${widget.url}`);
  });

  webview.addEventListener('did-finish-load', () => {
    console.log(`Loaded: ${widget.url}`);
  });

  webview.addEventListener('did-fail-load', (event) => {
    if (event.errorCode !== -3) { // Ignore ERR_ABORTED
      console.error(`Failed to load ${widget.url}:`, event.errorDescription);
      content.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #888; text-align: center; padding: 20px;">
          <div>
            <p>Failed to load</p>
            <p style="font-size: 12px; margin-top: 10px;">${widget.url}</p>
          </div>
        </div>
      `;
    }
  });

  // Track if initial load is complete
  let isInitialLoad = true;

  // Handle new window requests (popups)
  webview.addEventListener('new-window', (event) => {
    event.preventDefault();
    console.log('[RENDERER] New window requested:', event.url);
    console.log('[RENDERER] Widget navigation mode:', widget.navigationMode);

    // Get navigation mode (default to 'internal' for backwards compatibility)
    // 'same-domain' is treated as 'internal' for backwards compatibility
    const navigationMode = widget.navigationMode || 'internal';

    // If mode is 'external', always open in browser
    if (navigationMode === 'external') {
      console.log('[RENDERER] External mode - opening in browser');
      window.electronAPI.openExternal(event.url);
      return;
    }

    // If mode is 'internal', navigate within widget for same-window targets
    // but open popups externally
    console.log('[RENDERER] Internal mode - navigating within widget');
    webview.src = event.url;
  });

  webview.addEventListener('did-finish-load', () => {
    // Mark initial load as complete after first successful load
    if (isInitialLoad) {
      isInitialLoad = false;
      console.log('Initial widget load complete:', widget.url);
    }
  });

  // Note: Navigation handling (will-navigate) is done in main.js
  // The main process has full control over navigation based on widget settings

  // Update navigation buttons when webview navigates
  webview.addEventListener('did-navigate', () => {
    backBtn.disabled = !webview.canGoBack();
    forwardBtn.disabled = !webview.canGoForward();
  });

  webview.addEventListener('did-navigate-in-page', () => {
    backBtn.disabled = !webview.canGoBack();
    forwardBtn.disabled = !webview.canGoForward();
  });

  // Navigation button handlers
  backBtn.onclick = () => {
    if (webview.canGoBack()) {
      webview.goBack();
    }
  };

  forwardBtn.onclick = () => {
    if (webview.canGoForward()) {
      webview.goForward();
    }
  };

  refreshBtn.onclick = () => {
    webview.reload();
  };

  content.appendChild(webview);

  widgetDiv.appendChild(header);
  widgetDiv.appendChild(content);

  return widgetDiv;
}

// Add new tab
async function addTab(name) {
  // Calculate default shortcut based on position (Alt+1, Alt+2, etc.)
  const tabIndex = tabs.length;
  const defaultShortcut = tabIndex < 9 ? `Alt+${tabIndex + 1}` : null;

  const newTab = {
    id: Date.now().toString(),
    name: name || `Tab ${tabs.length + 1}`,
    widgets: [],
    shortcut: defaultShortcut
  };

  tabs.push(newTab);
  currentTabId = newTab.id;

  await saveTabs();
  renderTabs();
  renderWidgets();
}

// Remove tab
async function removeTab(tabId) {
  if (tabs.length === 1) {
    alert('Cannot remove the last tab');
    return;
  }

  if (!confirm('Are you sure you want to remove this tab and all its widgets?')) {
    return;
  }

  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;

  const tabToRemove = tabs[tabIndex];

  // Remove all widget DOM elements for this tab
  if (tabToRemove.widgets) {
    tabToRemove.widgets.forEach(widget => {
      const widgetElement = document.querySelector(`[data-widget-id="${widget.id}"]`);
      if (widgetElement) {
        widgetElement.remove();
      }
    });
  }

  // Remove tab from data
  tabs.splice(tabIndex, 1);

  // Switch to another tab
  if (currentTabId === tabId) {
    currentTabId = tabs[Math.max(0, tabIndex - 1)].id;
  }

  await saveTabs();
  renderTabs();
  renderWidgets();
}

// Rename tab
async function renameTab(tabId, newName) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.name = newName;
    await saveTabs();
    renderTabs();
  }
}

// Save tabs to storage
async function saveTabs() {
  try {
    await window.electronAPI.saveTabs({ tabs, currentTabId });
    console.log('Tabs saved');
  } catch (error) {
    console.error('Error saving tabs:', error);
  }
}

// Add new widget to current tab
async function addWidget(name, url, width, height, navigationMode = 'same-domain') {
  try {
    const currentTab = tabs.find(t => t.id === currentTabId);
    if (!currentTab) {
      alert('No active tab');
      return;
    }

    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Parse width and height as percentages (store as numbers)
    const widthPercent = width === '100%' || width === 100 ? 100 : parseInt(width);
    const heightPercent = height === '100%' || height === 100 ? 100 : parseInt(height);

    const newWidget = {
      id: Date.now().toString(),
      name,
      url,
      width: widthPercent,
      height: heightPercent,
      autoFocus: false,
      navigationMode: navigationMode || 'same-domain'
    };

    currentTab.widgets.push(newWidget);

    await saveTabs();
    renderWidgets();
    hideModal();
  } catch (error) {
    console.error('Error adding widget:', error);
    alert('Failed to add widget');
  }
}

// Remove widget from current tab
async function removeWidget(widgetId) {
  if (!confirm('Are you sure you want to remove this widget?')) {
    return;
  }

  try {
    const currentTab = tabs.find(t => t.id === currentTabId);
    if (!currentTab) return;

    // Remove from data
    currentTab.widgets = currentTab.widgets.filter(w => w.id !== widgetId);

    // Remove DOM element
    const widgetElement = document.querySelector(`[data-widget-id="${widgetId}"]`);
    if (widgetElement) {
      widgetElement.remove();
    }

    await saveTabs();
    renderWidgets(); // To update empty state if needed
  } catch (error) {
    console.error('Error removing widget:', error);
    alert('Failed to remove widget');
  }
}

// Toggle auto-focus for a widget
async function toggleAutoFocus(widgetId) {
  try {
    const currentTab = tabs.find(t => t.id === currentTabId);
    if (!currentTab) return;

    const widget = currentTab.widgets.find(w => w.id === widgetId);
    if (!widget) return;

    // If enabling auto-focus, disable it for all other widgets in this tab
    if (!widget.autoFocus) {
      currentTab.widgets.forEach(w => {
        w.autoFocus = false;

        // Update UI for all other widgets
        const otherWidgetElement = document.querySelector(`[data-widget-id="${w.id}"]`);
        if (otherWidgetElement) {
          const otherBtn = otherWidgetElement.querySelector('.btn-auto-focus');
          if (otherBtn) {
            otherBtn.className = 'btn-auto-focus';
            otherBtn.innerHTML = '<i class="fa-regular fa-star"></i> Auto';
            otherBtn.title = 'Enable auto-focus on tab open';
          }
        }
      });
    }

    // Toggle this widget's auto-focus
    widget.autoFocus = !widget.autoFocus;

    // Update UI for this widget
    const widgetElement = document.querySelector(`[data-widget-id="${widgetId}"]`);
    if (widgetElement) {
      const btn = widgetElement.querySelector('.btn-auto-focus');
      if (btn) {
        if (widget.autoFocus) {
          btn.className = 'btn-auto-focus active';
          btn.innerHTML = '<i class="fa-solid fa-star"></i> Auto';
          btn.title = 'Auto-focus enabled';
        } else {
          btn.className = 'btn-auto-focus';
          btn.innerHTML = '<i class="fa-regular fa-star"></i> Auto';
          btn.title = 'Enable auto-focus on tab open';
        }
      }
    }

    await saveTabs();
    console.log(`Widget ${widgetId} auto-focus: ${widget.autoFocus}`);
  } catch (error) {
    console.error('Error toggling auto-focus:', error);
    alert('Failed to toggle auto-focus');
  }
}

// Show edit widget modal
function showEditWidgetModal(widgetId) {
  isModalOpenLocal = true;
  const currentTab = tabs.find(t => t.id === currentTabId);
  if (!currentTab) return;

  const widget = currentTab.widgets.find(w => w.id === widgetId);
  if (!widget) return;

  editingWidgetId = widgetId;

  // Pre-fill form with current widget data
  document.getElementById('edit-widget-name').value = widget.name;
  document.getElementById('edit-widget-url').value = widget.url;

  // Set the correct radio button
  const navMode = widget.navigationMode || 'same-domain';
  const radioToCheck = document.querySelector(`input[name="edit-widget-navigation-mode"][value="${navMode === 'same-domain' ? 'internal' : navMode}"]`);
  if (radioToCheck) {
    radioToCheck.checked = true;
  }

  // Show modal
  addWidgetModal.classList.add('hidden');
  settingsModal.classList.add('hidden');
  editWidgetModal.classList.remove('hidden');
  modalOverlay.classList.remove('hidden');

  // Focus immediately (no animation delay)
  window.electronAPI.setModalState(true);
  document.getElementById('edit-widget-name').focus();
}

// Hide edit widget modal
function hideEditWidgetModal() {
  isModalOpenLocal = false;
  editWidgetModal.classList.add('hidden');
  modalOverlay.classList.add('hidden');
  editWidgetForm.reset();
  editingWidgetId = null;
  window.electronAPI.setModalState(false);
}

// Update widget details
async function updateWidget(widgetId, newName, newUrl, navigationMode) {
  try {
    const currentTab = tabs.find(t => t.id === currentTabId);
    if (!currentTab) return;

    const widget = currentTab.widgets.find(w => w.id === widgetId);
    if (!widget) return;

    // Ensure URL has protocol
    if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
      newUrl = 'https://' + newUrl;
    }

    // Update widget data
    widget.name = newName;
    widget.url = newUrl;
    widget.navigationMode = navigationMode || widget.navigationMode || 'same-domain';

    // Save to storage
    await saveTabs();

    // Update DOM elements
    const widgetElement = document.querySelector(`[data-widget-id="${widgetId}"]`);
    if (widgetElement) {
      // Update title
      const titleElement = widgetElement.querySelector('.widget-title');
      if (titleElement) {
        titleElement.textContent = newName;
        titleElement.title = newName;
      }

      // Update URL display
      const urlElement = widgetElement.querySelector('.widget-url');
      if (urlElement) {
        urlElement.textContent = truncateUrl(newUrl);
        urlElement.title = newUrl;
      }

      // Update webview
      const webview = widgetElement.querySelector('webview');
      if (webview) {
        // Update navigation mode attribute
        webview.setAttribute('data-navigation-mode', navigationMode);
        webview.setAttribute('data-widget-url', newUrl);

        // Notify main process to update cached navigation mode
        const webContentsId = webview.getWebContentsId();
        if (webContentsId) {
          window.electronAPI.updateWebviewNavigationMode(webContentsId, navigationMode, newUrl);
        }

        // Update URL if it changed
        if (webview.src !== newUrl) {
          webview.src = newUrl;
        }
      }
    }

    hideEditWidgetModal();
  } catch (error) {
    console.error('Error updating widget:', error);
    alert('Failed to update widget');
  }
}

// Show modal
function showModal() {
  isModalOpenLocal = true;
  addWidgetModal.classList.remove('hidden');
  settingsModal.classList.add('hidden');
  editWidgetModal.classList.add('hidden');
  modalOverlay.classList.remove('hidden');

  // Focus immediately (no animation delay)
  window.electronAPI.setModalState(true);
  document.getElementById('widget-name').focus();
}

// Hide modal
function hideModal() {
  isModalOpenLocal = false;
  modalOverlay.classList.add('hidden');
  addWidgetModal.classList.add('hidden');
  settingsModal.classList.add('hidden');
  editWidgetModal.classList.add('hidden');
  addWidgetForm.reset();
  // Notify main process that modal is closed
  window.electronAPI.setModalState(false);
}

// Show settings modal
async function showSettingsModal() {
  isModalOpenLocal = true;
  addWidgetModal.classList.add('hidden');
  editWidgetModal.classList.add('hidden');
  settingsModal.classList.remove('hidden');
  modalOverlay.classList.remove('hidden');
  window.electronAPI.setModalState(true);

  // Load current auto-launch status, privacy mode, compact mode, and shortcuts
  await loadAutoLaunchStatus();
  await loadPrivacyModeStatus();
  await loadCompactModeStatus();
  await loadShortcut();
  await loadTabCycleShortcut();
}

// Hide settings modal
function hideSettingsModal() {
  isModalOpenLocal = false;
  settingsModal.classList.add('hidden');
  modalOverlay.classList.add('hidden');
  window.electronAPI.setModalState(false);
}

// Load auto-launch status
async function loadAutoLaunchStatus() {
  try {
    const result = await window.electronAPI.getAutoLaunchStatus();
    if (result.success) {
      autoLaunchToggle.checked = result.enabled;
    }
  } catch (error) {
    console.error('Error loading auto-launch status:', error);
  }
}

// Toggle auto-launch
async function toggleAutoLaunch() {
  try {
    const enabled = autoLaunchToggle.checked;
    const result = await window.electronAPI.setAutoLaunch(enabled);
    if (result.success) {
      console.log(`Auto-launch ${enabled ? 'enabled' : 'disabled'}`);
    } else {
      console.error('Failed to set auto-launch:', result.error);
      // Revert toggle on error
      autoLaunchToggle.checked = !enabled;
    }
  } catch (error) {
    console.error('Error toggling auto-launch:', error);
    autoLaunchToggle.checked = !autoLaunchToggle.checked;
  }
}

// Load privacy mode status
async function loadPrivacyModeStatus() {
  try {
    const result = await window.electronAPI.getPrivacyMode();
    if (result.success) {
      privacyModeToggle.checked = result.enabled;
    }
  } catch (error) {
    console.error('Error loading privacy mode status:', error);
  }
}

// Toggle privacy mode
async function togglePrivacyMode() {
  try {
    const enabled = privacyModeToggle.checked;
    const result = await window.electronAPI.setPrivacyMode(enabled);
    if (result.success) {
      console.log(`Privacy mode ${enabled ? 'enabled' : 'disabled'}`);
    } else {
      console.error('Failed to set privacy mode:', result.error);
      // Revert toggle on error
      privacyModeToggle.checked = !enabled;
    }
  } catch (error) {
    console.error('Error toggling privacy mode:', error);
    privacyModeToggle.checked = !privacyModeToggle.checked;
  }
}

// Load compact mode status
async function loadCompactModeStatus() {
  try {
    const result = await window.electronAPI.getCompactMode();
    if (result.success) {
      compactModeToggle.checked = result.enabled;
      applyCompactMode(result.enabled);
    }
  } catch (error) {
    console.error('Error loading compact mode status:', error);
  }
}

// Apply compact mode styling and setup hover detection
function applyCompactMode(enabled) {
  const header = document.querySelector('.header');

  if (enabled) {
    document.body.classList.add('compact-mode');
    setupCompactModeHover();

    // Show header for 3 seconds initially when enabling
    showHeaderTemporarily(3000);
  } else {
    document.body.classList.remove('compact-mode');
    cleanupCompactModeHover();

    // Ensure header is visible in normal mode
    if (header) {
      header.classList.remove('visible');
    }
  }
}

// Header visibility management functions
function showHeader() {
  const header = document.querySelector('.header');
  if (!header) return;
  header.classList.add('visible');
  clearTimeout(headerVisibilityTimeout);
}

function hideHeader() {
  const header = document.querySelector('.header');
  if (!header) return;
  header.classList.remove('visible');
}

function scheduleHeaderHide(delay = HEADER_HIDE_DELAY) {
  clearTimeout(headerVisibilityTimeout);
  headerVisibilityTimeout = setTimeout(() => {
    hideHeader();
  }, delay);
}

function showHeaderTemporarily(duration) {
  showHeader();
  scheduleHeaderHide(duration);
}

// Hover detection setup for compact mode
function setupCompactModeHover() {
  const body = document.body;
  const header = document.querySelector('.header');

  if (!body.classList.contains('compact-mode')) return;

  // Mouse position tracking for top-edge detection
  body.addEventListener('mousemove', handleCompactModeMouseMove);

  // Keep header visible while hovering over it
  header.addEventListener('mouseenter', () => {
    if (!body.classList.contains('compact-mode')) return;
    showHeader();
  });

  header.addEventListener('mouseleave', (e) => {
    if (!body.classList.contains('compact-mode')) return;
    // Don't hide if mouse is still at the top edge
    if (e.clientY < HEADER_HOVER_THRESHOLD) return;
    scheduleHeaderHide();
  });
}

function handleCompactModeMouseMove(e) {
  if (!document.body.classList.contains('compact-mode')) return;

  // Suppress header when modal is open
  if (isModalOpenLocal) {
    hideHeader();
    return;
  }

  // Check if hovering over a widget (not header)
  const hoveredElement = document.elementFromPoint(e.clientX, e.clientY);
  if (hoveredElement) {
    const widgetElement = hoveredElement.closest('.widget');
    const headerElement = hoveredElement.closest('.header');

    if (widgetElement && !headerElement) {
      // User is interacting with widget - suppress header
      scheduleHeaderHide();
      return;
    }
  }

  // Original header appearance logic
  if (e.clientY < HEADER_HOVER_THRESHOLD) {
    showHeader();
  } else if (e.clientY > 150) {
    // Larger threshold to prevent flickering
    scheduleHeaderHide();
  }
}

function cleanupCompactModeHover() {
  document.body.removeEventListener('mousemove', handleCompactModeMouseMove);
  clearTimeout(headerVisibilityTimeout);
}

// Toggle compact mode
async function toggleCompactMode() {
  try {
    const enabled = compactModeToggle.checked;
    applyCompactMode(enabled);
    const result = await window.electronAPI.setCompactMode(enabled);
    if (result.success) {
      console.log(`Compact mode ${enabled ? 'enabled' : 'disabled'}`);
    } else {
      console.error('Failed to set compact mode:', result.error);
      // Revert toggle on error
      compactModeToggle.checked = !enabled;
      applyCompactMode(!enabled);
    }
  } catch (error) {
    console.error('Error toggling compact mode:', error);
    compactModeToggle.checked = !compactModeToggle.checked;
    applyCompactMode(!compactModeToggle.checked);
  }
}

// Load current shortcut
async function loadShortcut() {
  try {
    const shortcut = await window.electronAPI.getShortcut();
    if (shortcut) {
      currentShortcut = shortcut;
      updateShortcutDisplay();
    }
  } catch (error) {
    console.error('Error loading shortcut:', error);
  }
}

// Update shortcut display
function updateShortcutDisplay() {
  const displayShortcut = currentShortcut.replace('CommandOrControl', 'Ctrl');
  shortcutInput.value = displayShortcut;
}

// Start recording shortcut
function startRecordingShortcut() {
  isRecordingShortcut = true;
  shortcutInput.classList.add('recording');
  shortcutInput.value = 'Press your shortcut...';
  shortcutInput.focus();
}

// Stop recording shortcut
function stopRecordingShortcut() {
  isRecordingShortcut = false;
  shortcutInput.classList.remove('recording');
  updateShortcutDisplay();
}

// Handle shortcut key press
function handleShortcutKeyPress(e) {
  if (!isRecordingShortcut) return;

  e.preventDefault();
  e.stopPropagation();

  // Check if this is just a modifier key being pressed
  const key = e.key;
  if (key === 'Control' || key === 'Meta' || key === 'Alt' || key === 'Shift') {
    // Just a modifier key, don't register yet - show preview
    const modifiers = [];
    if (e.ctrlKey || e.metaKey) modifiers.push('Ctrl');
    if (e.altKey) modifiers.push('Alt');
    if (e.shiftKey) modifiers.push('Shift');
    shortcutInput.value = modifiers.join('+') + (modifiers.length > 0 ? '+...' : 'Press a key...');
    return;
  }

  const keys = [];

  // Add modifiers
  if (e.ctrlKey || e.metaKey) keys.push('CommandOrControl');
  if (e.altKey) keys.push('Alt');
  if (e.shiftKey) keys.push('Shift');

  // Add main key - we already have 'key' from above, now normalize it
  // Normalize key names for Electron accelerators
  let normalizedKey = key;

  // Special keys that need exact Electron format
  if (key === ' ') {
    normalizedKey = 'Space';
  } else if (key === 'Enter' || key === 'Return') {
    normalizedKey = 'Enter';
  } else if (key === 'Escape') {
    normalizedKey = 'Esc';
  } else if (key === 'Backspace') {
    normalizedKey = 'Backspace';
  } else if (key === 'Delete') {
    normalizedKey = 'Delete';
  } else if (key === 'Insert') {
    normalizedKey = 'Insert';
  } else if (key === 'Home') {
    normalizedKey = 'Home';
  } else if (key === 'End') {
    normalizedKey = 'End';
  } else if (key === 'PageUp') {
    normalizedKey = 'PageUp';
  } else if (key === 'PageDown') {
    normalizedKey = 'PageDown';
  } else if (key === 'ArrowUp') {
    normalizedKey = 'Up';
  } else if (key === 'ArrowDown') {
    normalizedKey = 'Down';
  } else if (key === 'ArrowLeft') {
    normalizedKey = 'Left';
  } else if (key === 'ArrowRight') {
    normalizedKey = 'Right';
  } else if (key === 'Tab') {
    normalizedKey = 'Tab';
  } else if (key.startsWith('F') && key.length <= 3 && !isNaN(key.substring(1))) {
    // F1-F12 keys
    normalizedKey = key;
  } else if (key.length === 1) {
    // Regular character keys - uppercase for consistency
    normalizedKey = key.toUpperCase();
  } else {
    // Use the key as-is for other cases
    normalizedKey = key;
  }

  keys.push(normalizedKey);

  // Need at least one modifier + one key
  if (keys.length >= 2) {
    const newShortcut = keys.join('+');
    setShortcut(newShortcut);
  }
}

// Set new shortcut
async function setShortcut(shortcut) {
  try {
    const result = await window.electronAPI.setShortcut(shortcut);
    if (result.success) {
      currentShortcut = shortcut;
      console.log(`Shortcut set to: ${shortcut}`);
    } else {
      alert(`Failed to set shortcut: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error setting shortcut:', error);
    alert('Failed to set shortcut');
  } finally {
    stopRecordingShortcut();
  }
}

// Reset shortcut to default
async function resetShortcut() {
  await setShortcut('CommandOrControl+Shift+Space');
}

// Load tab cycle shortcut
async function loadTabCycleShortcut() {
  try {
    const shortcuts = await window.electronAPI.getTabShortcuts();
    if (shortcuts) {
      currentTabCycleShortcut = shortcuts.tabCycleShortcut || 'CommandOrControl+Tab';
      updateTabCycleShortcutDisplay();
    }
  } catch (error) {
    console.error('Error loading tab shortcuts:', error);
  }
}

// Update tab cycle shortcut display
function updateTabCycleShortcutDisplay() {
  const displayShortcut = currentTabCycleShortcut.replace('CommandOrControl', 'Ctrl');
  tabCycleShortcutInput.value = displayShortcut;
}

// Start recording tab cycle shortcut
function startRecordingTabCycleShortcut() {
  isRecordingTabCycleShortcut = true;
  tabCycleShortcutInput.classList.add('recording');
  tabCycleShortcutInput.value = 'Press your shortcut...';
  tabCycleShortcutInput.focus();
}

// Stop recording tab cycle shortcut
function stopRecordingTabCycleShortcut() {
  isRecordingTabCycleShortcut = false;
  tabCycleShortcutInput.classList.remove('recording');
  updateTabCycleShortcutDisplay();
}

// Handle tab cycle shortcut key press
function handleTabCycleShortcutKeyPress(e) {
  if (!isRecordingTabCycleShortcut) return;

  e.preventDefault();
  e.stopPropagation();

  // Check if this is just a modifier key being pressed
  const key = e.key;
  if (key === 'Control' || key === 'Meta' || key === 'Alt' || key === 'Shift') {
    // Just a modifier key, don't register yet - show preview
    const modifiers = [];
    if (e.ctrlKey || e.metaKey) modifiers.push('Ctrl');
    if (e.altKey) modifiers.push('Alt');
    if (e.shiftKey) modifiers.push('Shift');
    tabCycleShortcutInput.value = modifiers.join('+') + (modifiers.length > 0 ? '+...' : 'Press a key...');
    return;
  }

  const keys = [];

  // Add modifiers
  if (e.ctrlKey || e.metaKey) keys.push('CommandOrControl');
  if (e.altKey) keys.push('Alt');
  if (e.shiftKey) keys.push('Shift');

  // Add main key - normalize it
  let normalizedKey = key;

  // Special keys that need exact Electron format
  if (key === ' ') {
    normalizedKey = 'Space';
  } else if (key === 'Enter' || key === 'Return') {
    normalizedKey = 'Enter';
  } else if (key === 'Escape') {
    normalizedKey = 'Esc';
  } else if (key === 'Backspace') {
    normalizedKey = 'Backspace';
  } else if (key === 'Delete') {
    normalizedKey = 'Delete';
  } else if (key === 'Insert') {
    normalizedKey = 'Insert';
  } else if (key === 'Home') {
    normalizedKey = 'Home';
  } else if (key === 'End') {
    normalizedKey = 'End';
  } else if (key === 'PageUp') {
    normalizedKey = 'PageUp';
  } else if (key === 'PageDown') {
    normalizedKey = 'PageDown';
  } else if (key === 'ArrowUp') {
    normalizedKey = 'Up';
  } else if (key === 'ArrowDown') {
    normalizedKey = 'Down';
  } else if (key === 'ArrowLeft') {
    normalizedKey = 'Left';
  } else if (key === 'ArrowRight') {
    normalizedKey = 'Right';
  } else if (key === 'Tab') {
    normalizedKey = 'Tab';
  } else if (key.startsWith('F') && key.length <= 3 && !isNaN(key.substring(1))) {
    // F1-F12 keys
    normalizedKey = key;
  } else if (key.length === 1) {
    // Regular character keys - uppercase for consistency
    normalizedKey = key.toUpperCase();
  } else {
    // Use the key as-is for other cases
    normalizedKey = key;
  }

  keys.push(normalizedKey);

  // Need at least one modifier + one key
  if (keys.length >= 2) {
    const newShortcut = keys.join('+');
    setTabCycleShortcut(newShortcut);
  }
}

// Set new tab cycle shortcut
async function setTabCycleShortcut(shortcut) {
  try {
    const result = await window.electronAPI.setTabShortcuts({
      tabCycleShortcut: shortcut
    });
    if (result.success) {
      currentTabCycleShortcut = shortcut;
      console.log(`Tab cycle shortcut set to: ${shortcut}`);
    } else {
      alert(`Failed to set tab cycle shortcut: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error setting tab cycle shortcut:', error);
    alert('Failed to set tab cycle shortcut');
  } finally {
    stopRecordingTabCycleShortcut();
  }
}

// Reset tab cycle shortcut to default
async function resetTabCycleShortcut() {
  await setTabCycleShortcut('CommandOrControl+Tab');
}

// Backup configuration
async function backupConfiguration() {
  try {
    const result = await window.electronAPI.backupConfig();

    if (result.canceled) {
      console.log('Backup canceled by user');
      return;
    }

    if (result.success) {
      alert('Configuration backed up successfully!\n\nFile saved to:\n' + result.filePath);
      console.log('Configuration backed up to:', result.filePath);
    } else {
      alert('Failed to backup configuration: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error backing up configuration:', error);
    alert('Failed to backup configuration');
  }
}

// Restore configuration
async function restoreConfiguration() {
  try {
    const confirmed = confirm(
      'Warning: Restoring a configuration will replace your current tabs, widgets, and settings.\n\n' +
      'Your current configuration will be lost unless you have backed it up.\n\n' +
      'Do you want to continue?'
    );

    if (!confirmed) {
      return;
    }

    const result = await window.electronAPI.restoreConfig();

    if (result.canceled) {
      console.log('Restore canceled by user');
      return;
    }

    if (result.success) {
      alert('Configuration restored successfully!\n\nThe app will reload now.');
      console.log('Configuration restored from:', result.filePath);

      // Reload the app to apply new configuration
      window.location.reload();
    } else {
      alert('Failed to restore configuration: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error restoring configuration:', error);
    alert('Failed to restore configuration: ' + error.message);
  }
}

// Truncate URL for display
function truncateUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url.substring(0, 30) + '...';
  }
}

// Show tab context menu
function showTabContextMenu(x, y, tabId) {
  contextMenuTargetTabId = tabId;
  tabContextMenu.style.left = `${x}px`;
  tabContextMenu.style.top = `${y}px`;
  tabContextMenu.classList.remove('hidden');
}

// Hide tab context menu
function hideTabContextMenu() {
  tabContextMenu.classList.add('hidden');
  contextMenuTargetTabId = null;
}

// Handle context menu actions
function handleContextMenuAction(action) {
  if (!contextMenuTargetTabId) return;

  switch (action) {
    case 'rename':
      // Find the tab element and trigger rename mode
      const tabElement = document.querySelector(`[data-tab-id="${contextMenuTargetTabId}"]`);
      if (tabElement) {
        const tabNameInput = tabElement.querySelector('.tab-name-editable');
        if (tabNameInput) {
          tabNameInput.readOnly = false;
          tabNameInput.focus();
          tabNameInput.select();
        }
      }
      break;
    case 'set-shortcut':
      setTabShortcut(contextMenuTargetTabId);
      break;
    case 'close':
      removeTab(contextMenuTargetTabId);
      break;
  }

  hideTabContextMenu();
}

// Setup event listeners
function setupEventListeners() {
  // Add tab button
  addTabBtn.addEventListener('click', () => {
    addTab();
  });

  // Open modal
  toggleAddPanelBtn.addEventListener('click', showModal);

  // Close modal - close button
  closeModalBtn.addEventListener('click', hideModal);

  // Close modal - cancel button
  cancelAddBtn.addEventListener('click', hideModal);

  // Settings button
  settingsBtn.addEventListener('click', showSettingsModal);

  // Close settings modal
  closeSettingsModalBtn.addEventListener('click', hideSettingsModal);

  // Settings tabs switching
  settingsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      // Update active tab button
      settingsTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active content
      document.querySelectorAll('.settings-tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(`${targetTab}-tab`).classList.add('active');
    });
  });

  // Auto-launch toggle
  autoLaunchToggle.addEventListener('change', toggleAutoLaunch);

  // Privacy mode toggle
  privacyModeToggle.addEventListener('change', togglePrivacyMode);

  // Compact mode toggle
  compactModeToggle.addEventListener('change', toggleCompactMode);

  // Shortcut input - click to start recording
  shortcutInput.addEventListener('click', startRecordingShortcut);

  // Shortcut input - handle key press
  shortcutInput.addEventListener('keydown', handleShortcutKeyPress);

  // Shortcut input - blur to stop recording
  shortcutInput.addEventListener('blur', () => {
    if (isRecordingShortcut) {
      stopRecordingShortcut();
    }
  });

  // Reset shortcut button
  resetShortcutBtn.addEventListener('click', resetShortcut);

  // Tab cycle shortcut input - click to start recording
  tabCycleShortcutInput.addEventListener('click', startRecordingTabCycleShortcut);

  // Tab cycle shortcut input - handle key press
  tabCycleShortcutInput.addEventListener('keydown', handleTabCycleShortcutKeyPress);

  // Tab cycle shortcut input - blur to stop recording
  tabCycleShortcutInput.addEventListener('blur', () => {
    if (isRecordingTabCycleShortcut) {
      stopRecordingTabCycleShortcut();
    }
  });

  // Reset tab cycle shortcut button
  resetTabCycleShortcutBtn.addEventListener('click', resetTabCycleShortcut);

  // Backup configuration button
  backupConfigBtn.addEventListener('click', backupConfiguration);

  // Restore configuration button
  restoreConfigBtn.addEventListener('click', restoreConfiguration);

  // Edit widget form submission
  editWidgetForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('edit-widget-name').value;
    const url = document.getElementById('edit-widget-url').value;
    const navigationMode = document.querySelector('input[name="edit-widget-navigation-mode"]:checked').value;

    if (editingWidgetId) {
      updateWidget(editingWidgetId, name, url, navigationMode);
    }
  });

  // Close edit modal - close button
  closeEditModalBtn.addEventListener('click', hideEditWidgetModal);

  // Close edit modal - cancel button
  cancelEditBtn.addEventListener('click', hideEditWidgetModal);

  // Close modal - click outside
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      if (!settingsModal.classList.contains('hidden')) {
        hideSettingsModal();
      } else if (!editWidgetModal.classList.contains('hidden')) {
        hideEditWidgetModal();
      } else {
        hideModal();
      }
    }
  });

  // Close modal - ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalOverlay.classList.contains('hidden')) {
      if (!settingsModal.classList.contains('hidden')) {
        hideSettingsModal();
      } else if (!editWidgetModal.classList.contains('hidden')) {
        hideEditWidgetModal();
      } else {
        hideModal();
      }
    }
  });

  // Note: Ctrl+Tab for tab switching is handled in main.js via before-input-event
  // This ensures it works globally, even when webviews have focus

  // Add widget form submission
  addWidgetForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('widget-name').value;
    const url = document.getElementById('widget-url').value;
    const width = document.getElementById('widget-width').value;
    const height = document.getElementById('widget-height').value;
    const navigationMode = document.querySelector('input[name="widget-navigation-mode"]:checked').value;

    addWidget(name, url, width, height, navigationMode);
  });

  // Context menu item clicks
  tabContextMenu.addEventListener('click', (e) => {
    const menuItem = e.target.closest('.context-menu-item');
    if (menuItem) {
      const action = menuItem.dataset.action;
      handleContextMenuAction(action);
    }
  });

  // Hide context menu when clicking anywhere else
  document.addEventListener('click', (e) => {
    if (!tabContextMenu.contains(e.target) && !tabContextMenu.classList.contains('hidden')) {
      hideTabContextMenu();
    }
  });

  // Hide context menu on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !tabContextMenu.classList.contains('hidden')) {
      hideTabContextMenu();
    }
  });
}

// Widget menu helper functions
function toggleWidgetMenu(menuDropdown) {
  menuDropdown.classList.toggle('hidden');
}

function closeWidgetMenu(menuDropdown) {
  menuDropdown.classList.add('hidden');
}

// Start the app
init();
