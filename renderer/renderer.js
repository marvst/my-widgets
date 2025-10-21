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
const tabContextMenu = document.getElementById('tab-context-menu');
const shortcutInput = document.getElementById('shortcut-input');
const resetShortcutBtn = document.getElementById('reset-shortcut-btn');

// Context menu state
let contextMenuTargetTabId = null;

// Shortcut recording state
let isRecordingShortcut = false;
let currentShortcut = 'CommandOrControl+Shift+Space';

// Initialize
async function init() {
  await loadTabs();
  renderTabs();

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

  // Listen for global Tab key press from main process
  window.electronAPI.onSwitchNextTab(() => {
    switchToNextTab();
  });
}

// Load tabs from storage
async function loadTabs() {
  try {
    const data = await window.electronAPI.getTabs();
    tabs = data.tabs || [];
    currentTabId = data.currentTabId || null;
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

  if (tab.id === currentTabId) {
    tabDiv.classList.add('active');
  }

  const tabName = document.createElement('input');
  tabName.className = 'tab-name-editable';
  tabName.type = 'text';
  tabName.value = tab.name;
  tabName.readOnly = true;
  tabName.title = 'Double-click to rename';

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
}

// Switch to next tab (with wrapping)
function switchToNextTab() {
  if (tabs.length === 0) return;

  const currentIndex = tabs.findIndex(t => t.id === currentTabId);
  const nextIndex = (currentIndex + 1) % tabs.length;

  switchTab(tabs[nextIndex].id);
  scrollTabIntoView(tabs[nextIndex].id);
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

// Focus the widget marked as auto-focus in current tab
function focusAutoFocusWidget() {
  const currentTab = tabs.find(t => t.id === currentTabId);
  if (!currentTab) return;

  const autoFocusWidget = currentTab.widgets.find(w => w.autoFocus);
  if (!autoFocusWidget) return;

  // Find the webview for this widget and focus it
  setTimeout(() => {
    const widgetElement = document.querySelector(`[data-widget-id="${autoFocusWidget.id}"]`);
    if (widgetElement) {
      const webview = widgetElement.querySelector('webview');
      if (webview) {
        webview.focus();
        console.log(`Auto-focused widget: ${autoFocusWidget.name}`);
      }
    }
  }, 100); // Small delay to ensure webview is fully rendered
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

  const actions = document.createElement('div');
  actions.className = 'widget-actions';

  // Auto-focus toggle button
  const autoFocusBtn = document.createElement('button');
  autoFocusBtn.className = widget.autoFocus ? 'btn-auto-focus active' : 'btn-auto-focus';
  autoFocusBtn.textContent = widget.autoFocus ? '★ Auto' : '☆ Auto';
  autoFocusBtn.title = widget.autoFocus ? 'Auto-focus enabled' : 'Enable auto-focus on tab open';
  autoFocusBtn.onclick = async () => {
    await toggleAutoFocus(widget.id);
  };

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-danger';
  removeBtn.textContent = 'Remove';
  removeBtn.onclick = () => removeWidget(widget.id);

  actions.appendChild(autoFocusBtn);
  actions.appendChild(removeBtn);

  header.appendChild(titleContainer);

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

  // Create resize controls container
  const resizeControls = document.createElement('div');
  resizeControls.className = 'resize-controls';

  // Create width selector
  const widthSelector = document.createElement('select');
  widthSelector.className = 'size-selector';
  widthSelector.title = 'Select width';

  const widthOptions = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  widthOptions.forEach(percent => {
    const option = document.createElement('option');
    option.value = percent;
    option.textContent = `W:${percent}%`;
    if (percent === widthPercent) {
      option.selected = true;
    }
    widthSelector.appendChild(option);
  });

  // Create height selector
  const heightSelector = document.createElement('select');
  heightSelector.className = 'size-selector';
  heightSelector.title = 'Select height';

  const heightOptions = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  heightOptions.forEach(percent => {
    const option = document.createElement('option');
    option.value = percent;
    option.textContent = `H:${percent}%`;
    if (percent === heightPercent) {
      option.selected = true;
    }
    heightSelector.appendChild(option);
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

  resizeControls.appendChild(widthSelector);
  resizeControls.appendChild(heightSelector);

  // Append resize controls and actions to header
  header.appendChild(resizeControls);
  header.appendChild(actions);

  // Create webview for the website
  const webview = document.createElement('webview');
  webview.src = widget.url;
  webview.style.width = '100%';
  webview.style.height = '100%';
  webview.setAttribute('allowpopups', '');

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
    console.log('New window requested:', event.url);
    // Open in external browser
    window.electronAPI.openExternal(event.url);
  });

  webview.addEventListener('did-finish-load', () => {
    // Mark initial load as complete after first successful load
    if (isInitialLoad) {
      isInitialLoad = false;
      console.log('Initial widget load complete:', widget.url);
    }
  });

  // Handle regular link clicks (navigation away from original URL)
  webview.addEventListener('will-navigate', (event) => {
    // Allow the initial page load, but intercept any subsequent navigations
    if (!isInitialLoad && event.url !== widget.url) {
      event.preventDefault();
      console.log('Navigation intercepted, opening in browser:', event.url);
      // Open in external browser
      window.electronAPI.openExternal(event.url);
    }
  });

  content.appendChild(webview);

  widgetDiv.appendChild(header);
  widgetDiv.appendChild(content);

  return widgetDiv;
}

// Add new tab
async function addTab(name) {
  const newTab = {
    id: Date.now().toString(),
    name: name || `Tab ${tabs.length + 1}`,
    widgets: []
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
async function addWidget(name, url, width, height) {
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
      autoFocus: false
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
            otherBtn.textContent = '☆ Auto';
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
          btn.textContent = '★ Auto';
          btn.title = 'Auto-focus enabled';
        } else {
          btn.className = 'btn-auto-focus';
          btn.textContent = '☆ Auto';
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

// Show modal
function showModal() {
  addWidgetModal.classList.remove('hidden');
  settingsModal.classList.add('hidden');
  modalOverlay.classList.remove('hidden');

  // Wait for animation to complete before focusing
  modalOverlay.addEventListener('animationend', () => {
    // Notify main process that modal is open
    window.electronAPI.setModalState(true);
    // Focus on first input field
    document.getElementById('widget-name').focus();
  }, { once: true });
}

// Hide modal
function hideModal() {
  modalOverlay.classList.add('hidden');
  addWidgetModal.classList.add('hidden');
  settingsModal.classList.add('hidden');
  addWidgetForm.reset();
  // Notify main process that modal is closed
  window.electronAPI.setModalState(false);
}

// Show settings modal
async function showSettingsModal() {
  addWidgetModal.classList.add('hidden');
  settingsModal.classList.remove('hidden');
  modalOverlay.classList.remove('hidden');
  window.electronAPI.setModalState(true);

  // Load current auto-launch status and shortcut
  await loadAutoLaunchStatus();
  await loadShortcut();
}

// Hide settings modal
function hideSettingsModal() {
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

  // Auto-launch toggle
  autoLaunchToggle.addEventListener('change', toggleAutoLaunch);

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

  // Close modal - click outside
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      if (!settingsModal.classList.contains('hidden')) {
        hideSettingsModal();
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
      } else {
        hideModal();
      }
    }
  });

  // Tab navigation with Ctrl+Tab (fallback for when webview doesn't have focus)
  document.addEventListener('keydown', (e) => {
    // Don't navigate if modal is open
    if (!modalOverlay.classList.contains('hidden')) return;

    if (e.key === 'Tab' && e.ctrlKey) {
      e.preventDefault();
      switchToNextTab();
    }
  }, true); // Use capture phase to catch the event before it reaches webviews

  // Add widget form submission
  addWidgetForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('widget-name').value;
    const url = document.getElementById('widget-url').value;
    const width = document.getElementById('widget-width').value;
    const height = document.getElementById('widget-height').value;

    addWidget(name, url, width, height);
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

// Start the app
init();
