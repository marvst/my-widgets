// State
let widgets = [];

// DOM Elements
const widgetsContainer = document.getElementById('widgets-container');
const emptyState = document.getElementById('empty-state');
const modalOverlay = document.getElementById('modal-overlay');
const addWidgetModal = document.getElementById('add-widget-modal');
const addWidgetForm = document.getElementById('add-widget-form');
const toggleAddPanelBtn = document.getElementById('toggle-add-panel');
const closeModalBtn = document.getElementById('close-modal');
const cancelAddBtn = document.getElementById('cancel-add');

// Initialize
async function init() {
  await loadWidgets();
  renderWidgets();
  setupEventListeners();
}

// Load widgets from storage
async function loadWidgets() {
  try {
    widgets = await window.electronAPI.getWidgets();
    console.log('Loaded widgets:', widgets);
  } catch (error) {
    console.error('Error loading widgets:', error);
    widgets = [];
  }
}

// Render all widgets
function renderWidgets() {
  widgetsContainer.innerHTML = '';

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
    const result = await window.electronAPI.updateWidgetSize(widget.id, newWidthPercent, currentHeightPercent);
    if (result.success) {
      widgets = result.widgets;
      console.log(`Widget ${widget.id} width updated to ${newWidthPercent}%`);
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
    const result = await window.electronAPI.updateWidgetSize(widget.id, currentWidthPercent, newHeightPercent);
    if (result.success) {
      widgets = result.widgets;
      console.log(`Widget ${widget.id} height updated to ${newHeightPercent}%`);
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

// Add new widget
async function addWidget(name, url, width, height) {
  try {
    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Parse width and height as percentages (store as numbers)
    const widthPercent = width === '100%' || width === 100 ? 100 : parseInt(width);
    const heightPercent = height === '100%' || height === 100 ? 100 : parseInt(height);

    const result = await window.electronAPI.addWidget({
      name,
      url,
      width: widthPercent,
      height: heightPercent
    });

    if (result.success) {
      widgets = result.widgets;
      renderWidgets();
      hideModal();
    } else {
      alert('Failed to add widget: ' + result.error);
    }
  } catch (error) {
    console.error('Error adding widget:', error);
    alert('Failed to add widget');
  }
}

// Remove widget
async function removeWidget(widgetId) {
  if (!confirm('Are you sure you want to remove this widget?')) {
    return;
  }

  try {
    const result = await window.electronAPI.removeWidget(widgetId);

    if (result.success) {
      widgets = result.widgets;
      renderWidgets();
    } else {
      alert('Failed to remove widget: ' + result.error);
    }
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
