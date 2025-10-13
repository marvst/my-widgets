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

  // Double-click to edit tab name
  tabName.addEventListener('dblclick', () => {
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

  // Click to switch tab
  tabDiv.addEventListener('click', (e) => {
    if (e.target !== tabName && !tabName.readOnly) return;
    if (tabName.readOnly) {
      switchTab(tab.id);
    }
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

// Scroll tab into view
function scrollTabIntoView(tabId) {
  const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
  if (tabElement) {
    tabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

// Render all widgets for current tab
function renderWidgets() {
  widgetsContainer.innerHTML = '';

  const currentTab = tabs.find(t => t.id === currentTabId);
  if (!currentTab) {
    emptyState.classList.remove('hidden');
    return;
  }

  const widgets = currentTab.widgets || [];

  if (widgets.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  widgets.forEach(widget => {
    const widgetElement = createWidgetElement(widget);
    widgetsContainer.appendChild(widgetElement);
  });
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

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-danger';
  removeBtn.textContent = 'Remove';
  removeBtn.onclick = () => removeWidget(widget.id);

  actions.appendChild(removeBtn);

  header.appendChild(titleContainer);

  // Create widget content
  const content = document.createElement('div');
  content.className = 'widget-content';

  const widthPercent = typeof widget.width === 'number' ? widget.width : 100;
  const heightPercent = typeof widget.height === 'number' ? widget.height : 100;

  // Set width using calc to account for gaps between widgets
  // Gap is 20px, so we need to subtract proportionally
  if (widthPercent === 100) {
    widgetDiv.style.width = '100%';
  } else {
    widgetDiv.style.width = `calc(${widthPercent}% - ${20 * (1 - widthPercent / 100)}px)`;
  }
  widgetDiv.style.minWidth = '200px'; // Minimum width to prevent too small widgets
  widgetDiv.style.flexShrink = '0'; // Prevent shrinking when wrapping

  // Set height - subtract body padding (40px), header (~70px), and gap (20px) = 130px
  widgetDiv.style.height = `calc(${heightPercent}vh - 130px)`;

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

    // Apply new width accounting for gaps
    if (newWidthPercent === 100) {
      widgetDiv.style.width = '100%';
    } else {
      widgetDiv.style.width = `calc(${newWidthPercent}% - ${20 * (1 - newWidthPercent / 100)}px)`;
    }
    widgetDiv.dataset.widthPercent = newWidthPercent;

    // Save to storage
    const currentHeightPercent = parseInt(widgetDiv.dataset.heightPercent);
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

    // Apply new height to the widget container (subtract 130px for header, padding, gaps)
    widgetDiv.style.height = `calc(${newHeightPercent}vh - 130px)`;
    widgetDiv.dataset.heightPercent = newHeightPercent;

    // Save to storage
    const currentWidthPercent = parseInt(widgetDiv.dataset.widthPercent);
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

  // Handle new window requests (popups)
  webview.addEventListener('new-window', (event) => {
    console.log('New window requested:', event.url);
    // Open in external browser
    window.electronAPI.openExternal(event.url);
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
      height: heightPercent
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

    currentTab.widgets = currentTab.widgets.filter(w => w.id !== widgetId);

    await saveTabs();
    renderWidgets();
  } catch (error) {
    console.error('Error removing widget:', error);
    alert('Failed to remove widget');
  }
}

// Show modal
function showModal() {
  modalOverlay.classList.remove('hidden');
  // Focus on first input field
  document.getElementById('widget-name').focus();
}

// Hide modal
function hideModal() {
  modalOverlay.classList.add('hidden');
  addWidgetForm.reset();
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

  // Close modal - click outside
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      hideModal();
    }
  });

  // Close modal - ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalOverlay.classList.contains('hidden')) {
      hideModal();
    }
  });

  // Tab navigation with arrow keys
  document.addEventListener('keydown', (e) => {
    // Don't navigate if modal is open or typing in an input
    if (!modalOverlay.classList.contains('hidden')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const currentIndex = tabs.findIndex(t => t.id === currentTabId);

    if (e.key === 'ArrowLeft' && currentIndex > 0) {
      // Navigate to previous tab
      e.preventDefault();
      switchTab(tabs[currentIndex - 1].id);
      scrollTabIntoView(tabs[currentIndex - 1].id);
    } else if (e.key === 'ArrowRight' && currentIndex < tabs.length - 1) {
      // Navigate to next tab
      e.preventDefault();
      switchTab(tabs[currentIndex + 1].id);
      scrollTabIntoView(tabs[currentIndex + 1].id);
    }
  });

  // Add widget form submission
  addWidgetForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('widget-name').value;
    const url = document.getElementById('widget-url').value;
    const width = document.getElementById('widget-width').value;
    const height = document.getElementById('widget-height').value;

    addWidget(name, url, width, height);
  });
}

// Start the app
init();
