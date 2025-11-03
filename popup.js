// Popup script for settings management

const form = document.getElementById('settings-form');
const statusMessage = document.getElementById('status-message');
const testButton = document.getElementById('test-connection');
const themeToggle = document.getElementById('theme-toggle');

const baseUrlInput = document.getElementById('base-url');
const apiKeyInput = document.getElementById('api-key');
const modelInput = document.getElementById('model');

// Theme management
async function loadTheme() {
  try {
    const { theme } = await browser.storage.sync.get('theme');
    const isDark = theme === 'dark';

    if (isDark) {
      document.body.classList.add('dark-mode');
      themeToggle.querySelector('.theme-icon').textContent = 'Light';
    } else {
      document.body.classList.remove('dark-mode');
      themeToggle.querySelector('.theme-icon').textContent = 'Dark';
    }
  } catch (error) {
    console.error('Error loading theme:', error);
  }
}

async function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  const theme = isDark ? 'dark' : 'light';

  themeToggle.querySelector('.theme-icon').textContent = isDark ? 'Light' : 'Dark';

  try {
    await browser.storage.sync.set({ theme });
    // Notify content scripts to update their theme
    const tabs = await browser.tabs.query({});
    tabs.forEach(tab => {
      browser.tabs.sendMessage(tab.id, { type: 'theme-changed', theme }).catch(() => {});
    });
  } catch (error) {
    console.error('Error saving theme:', error);
  }
}

themeToggle.addEventListener('click', toggleTheme);

// Provider configurations
const PROVIDER_CONFIG = {
  openai: {
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    apiKeyHelp: 'Your OpenAI API key (required)'
  },
  anthropic: {
    name: 'Anthropic Claude',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
    apiKeyHelp: 'Your Anthropic API key (required)'
  },
  google: {
    name: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-pro',
    apiKeyHelp: 'Your Google AI API key (required)'
  }
};

// Update form fields based on selected provider
function updateProviderFields(provider) {
  const config = PROVIDER_CONFIG[provider];
  const baseUrlInput = document.getElementById('base-url');
  const modelInput = document.getElementById('model');
  const apiKeyHelp = document.getElementById('api-key-help');

  // Update base URL
  baseUrlInput.value = config.defaultBaseUrl;
  baseUrlInput.placeholder = config.defaultBaseUrl;

  // Update model placeholder with default model
  modelInput.placeholder = `e.g., ${config.defaultModel}`;

  // Update API key help text
  apiKeyHelp.textContent = config.apiKeyHelp;
}

// Load saved settings
async function loadSettings() {
  try {
    const settings = await browser.storage.sync.get(['provider', 'apiKey', 'baseUrl', 'model']);

    // Set provider first
    const provider = settings.provider || 'openai';
    document.getElementById('provider').value = provider;
    updateProviderFields(provider);

    // Then set other settings
    if (settings.baseUrl) {
      baseUrlInput.value = settings.baseUrl;
    }
    if (settings.apiKey) {
      apiKeyInput.value = settings.apiKey;
    }
    if (settings.model) {
      modelInput.value = settings.model;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Auto-save on input change (debounced)
let autoSaveTimeout;
function autoSave() {
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(async () => {
    const provider = document.getElementById('provider').value;
    const config = PROVIDER_CONFIG[provider];
    
    const settings = {
      provider: provider,
      baseUrl: baseUrlInput.value || config.defaultBaseUrl,
      apiKey: apiKeyInput.value,
      model: modelInput.value || config.defaultModel
    };

    try {
      await browser.storage.sync.set(settings);
      console.log('Settings auto-saved');
    } catch (error) {
      console.error('Error auto-saving settings:', error);
    }
  }, 500); // Wait 500ms after user stops typing
}

// Add auto-save listeners
baseUrlInput.addEventListener('input', autoSave);
apiKeyInput.addEventListener('input', autoSave);
modelInput.addEventListener('input', autoSave);

// Save settings
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  const provider = formData.get('provider');
  const config = PROVIDER_CONFIG[provider];
  
  const settings = {
    provider: provider,
    baseUrl: formData.get('baseUrl') || config.defaultBaseUrl,
    apiKey: formData.get('apiKey'),
    model: formData.get('model') || config.defaultModel
  };

  try {
    await browser.storage.sync.set(settings);
    showStatus('Settings saved successfully!', 'success');
  } catch (error) {
    showStatus('Failed to save settings: ' + error.message, 'error');
  }
});

// Test connection
testButton.addEventListener('click', async () => {
  const provider = document.getElementById('provider').value;
  const apiKey = document.getElementById('api-key').value;
  const baseUrl = document.getElementById('base-url').value || PROVIDER_CONFIG[provider].defaultBaseUrl;
  const model = document.getElementById('model').value || PROVIDER_CONFIG[provider].defaultModel;

  if (!apiKey) {
    showStatus('Please enter an API key first', 'error');
    return;
  }

  testButton.disabled = true;
  testButton.textContent = 'Testing...';
  showStatus('Testing connection...', 'info');

  try {
    let apiEndpoint, requestBody;

    if (provider === 'google') {
      apiEndpoint = `${baseUrl}/models/${model}:generateContent`;
      requestBody = {
        contents: [{ parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 5 }
      };
    } else if (provider === 'anthropic') {
      apiEndpoint = `${baseUrl}/messages`;
      requestBody = {
        model: model,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Hi' }]
      };
    } else {
      // OpenAI and custom providers
      apiEndpoint = `${baseUrl}/chat/completions`;
      requestBody = {
        model: model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
      };
    }

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (response.ok) {
      showStatus('✓ Connection successful!', 'success');
    } else {
      const error = await response.json();
      showStatus('Connection failed: ' + (error.error?.message || error.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    showStatus('Connection failed: ' + error.message, 'error');
  } finally {
    testButton.disabled = false;
    testButton.textContent = 'Test Connection';
  }
});

// Show status message
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 3000);
  }
}

// Tab switching
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;

    // Update active tab
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Update active content
    tabContents.forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    // Load data when switching to specific tabs
    if (tabName === 'history') {
      loadHistory();
    } else if (tabName === 'advanced') {
      loadAdvancedSettings();
    }
  });
});

// History management
let defaultPrompts = {};

async function loadHistory() {
  try {
    console.log('Loading history...');
    const response = await browser.runtime.sendMessage({ type: 'get-history' });
    console.log('Received history response:', response);

    if (!response) {
      console.error('No response received from background script');
      return;
    }

    const history = response.history || [];
    console.log('History entries:', history.length);

    const historyList = document.getElementById('history-list');

    if (history.length === 0) {
      historyList.innerHTML = '<div class="empty-state"><p>No history yet. Start using AI commands to see them here!</p></div>';
      return;
    }

    // Helper function to get relative time
    function getRelativeTime(timestamp) {
      const now = new Date();
      const date = new Date(timestamp);
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    }

    // Helper function to group entries by date
    function groupByDate(entries) {
      const groups = {
        today: [],
        yesterday: [],
        thisWeek: [],
        older: []
      };

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      entries.forEach(entry => {
        const entryDate = new Date(entry.timestamp);
        const entryDay = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());

        if (entryDay.getTime() === today.getTime()) {
          groups.today.push(entry);
        } else if (entryDay.getTime() === yesterday.getTime()) {
          groups.yesterday.push(entry);
        } else if (entryDate >= weekAgo) {
          groups.thisWeek.push(entry);
        } else {
          groups.older.push(entry);
        }
      });

      return groups;
    }

    const groups = groupByDate(history);
    let html = '';

    // Render groups
    if (groups.today.length > 0) {
      html += '<div class="history-group-header">Today</div>';
      html += groups.today.map(entry => renderHistoryItem(entry)).join('');
    }
    if (groups.yesterday.length > 0) {
      html += '<div class="history-group-header">Yesterday</div>';
      html += groups.yesterday.map(entry => renderHistoryItem(entry)).join('');
    }
    if (groups.thisWeek.length > 0) {
      html += '<div class="history-group-header">This Week</div>';
      html += groups.thisWeek.map(entry => renderHistoryItem(entry)).join('');
    }
    if (groups.older.length > 0) {
      html += '<div class="history-group-header">Older</div>';
      html += groups.older.map(entry => renderHistoryItem(entry)).join('');
    }

    function renderHistoryItem(entry) {
      const timeStr = getRelativeTime(entry.timestamp);

      return `
        <div class="history-item" data-search="${escapeHtml(entry.input + ' ' + entry.output + ' ' + entry.commandTitle).toLowerCase()}">
          <div class="history-header">
            <div class="history-header-left">
              <div class="history-command-info">
                <span class="history-command">${entry.commandTitle}</span>
                <span class="history-time">${timeStr}</span>
              </div>
            </div>
          </div>
          <div class="history-content">
            <div class="history-text">
              <strong>Input:</strong>
              <span class="history-text-content">${escapeHtml(truncate(entry.input, 150))}</span>
            </div>
            <div class="history-text">
              <strong>Output:</strong>
              <span class="history-text-content">${escapeHtml(truncate(entry.output, 150))}</span>
            </div>
          </div>
          <div class="history-metadata">
            <div class="history-metadata-item">
              <span class="history-metadata-label">Page:</span>
              <span>${escapeHtml(truncate(entry.pageTitle, 30))}</span>
            </div>
            <div class="history-metadata-item">
              <span class="history-metadata-label">Model:</span>
              <span>${entry.model}</span>
            </div>
          </div>
          <div class="history-actions">
            <button class="btn-small copy-history" data-text="${escapeHtml(entry.output)}">Copy Output</button>
            ${entry.prompt ? `<button class="btn-small view-prompt" data-prompt="${escapeHtml(entry.prompt)}">View Prompt</button>` : ''}
          </div>
        </div>
      `;
    }

    historyList.innerHTML = html;

    // Add event listeners for buttons
    historyList.querySelectorAll('.copy-history').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.text);
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy Output', 1500);
      });
    });

    historyList.querySelectorAll('.view-prompt').forEach(btn => {
      btn.addEventListener('click', () => {
        console.log('Full Prompt:\n', btn.dataset.prompt);
        alert('Prompt logged to console! (Press F12 to view)');
      });
    });
  } catch (error) {
    console.error('Error loading history:', error);
  }
}

document.getElementById('clear-history').addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all history?')) {
    await browser.runtime.sendMessage({ type: 'clear-history' });
    loadHistory();
  }
});

// Search history
document.getElementById('history-search').addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase().trim();
  const historyItems = document.querySelectorAll('.history-item');
  const groupHeaders = document.querySelectorAll('.history-group-header');

  if (!searchTerm) {
    // Show all items and headers
    historyItems.forEach(item => item.style.display = '');
    groupHeaders.forEach(header => header.style.display = '');
    return;
  }

  // Filter items
  let visibleGroups = new Set();
  historyItems.forEach(item => {
    const searchData = item.getAttribute('data-search') || '';
    if (searchData.includes(searchTerm)) {
      item.style.display = '';
      // Find which group this item belongs to
      let prevElement = item.previousElementSibling;
      while (prevElement) {
        if (prevElement.classList.contains('history-group-header')) {
          visibleGroups.add(prevElement.textContent);
          break;
        }
        prevElement = prevElement.previousElementSibling;
      }
    } else {
      item.style.display = 'none';
    }
  });

  // Show/hide group headers based on whether they have visible items
  groupHeaders.forEach(header => {
    if (visibleGroups.has(header.textContent)) {
      header.style.display = '';
    } else {
      header.style.display = 'none';
    }
  });
});

// Advanced settings
async function loadAdvancedSettings() {
  try {
    console.log('Loading advanced settings...');

    // Get default prompts from background
    const defaultsResponse = await browser.runtime.sendMessage({ type: 'get-default-prompts' });
    console.log('Received default prompts:', defaultsResponse);

    if (!defaultsResponse || !defaultsResponse.prompts) {
      console.error('No prompts received from background script');
      return;
    }

    defaultPrompts = defaultsResponse.prompts;

    // Load current settings
    const settings = await browser.storage.sync.get([
      'customPrompts',
      'includePageTitle',
      'includeTextContext',
      'debugMode',
      'saveHistory',
      'showContextMenu',
      'quickMenuShortcut',
      'enablePopupWorkflow'
    ]);

    console.log('Loaded settings:', settings);

    const customPrompts = settings.customPrompts || {};

    // Load general settings
    document.getElementById('save-history').checked = settings.saveHistory !== false;
    document.getElementById('show-context-menu').checked = settings.showContextMenu !== false;
    document.getElementById('enable-popup-workflow').checked = settings.enablePopupWorkflow || false;

    // Load keyboard shortcut
    const shortcut = settings.quickMenuShortcut || { ctrl: true, shift: true, key: 'Space' };
    document.getElementById('quick-menu-shortcut').value = formatShortcut(shortcut);

    // Load context settings
    document.getElementById('include-page-title').checked = settings.includePageTitle !== false;
    document.getElementById('include-text-context').checked = settings.includeTextContext !== false;
    document.getElementById('debug-mode').checked = settings.debugMode || false;

    // Load prompts
    document.getElementById('prompt-fix-spelling').value = customPrompts['fix-spelling'] || defaultPrompts['fix-spelling'] || '';
    document.getElementById('prompt-continue-writing').value = customPrompts['continue-writing'] || defaultPrompts['continue-writing'] || '';
    document.getElementById('prompt-suggest-rewrites').value = customPrompts['suggest-rewrites'] || defaultPrompts['suggest-rewrites'] || '';
    document.getElementById('prompt-explain').value = customPrompts['explain'] || defaultPrompts['explain'] || '';

    console.log('Advanced settings loaded successfully');
  } catch (error) {
    console.error('Error loading advanced settings:', error);
  }
}

// Format shortcut for display
function formatShortcut(shortcut) {
  const parts = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.meta) parts.push('Cmd');
  parts.push(shortcut.key);
  return parts.join('+');
}

// Keyboard shortcut recording
let recordingShortcut = false;
let currentShortcut = null;

document.getElementById('quick-menu-shortcut').addEventListener('click', () => {
  if (recordingShortcut) return;

  recordingShortcut = true;
  const input = document.getElementById('quick-menu-shortcut');
  input.value = 'Press keys...';
  input.classList.add('recording');
});

document.getElementById('quick-menu-shortcut').addEventListener('keydown', async (e) => {
  if (!recordingShortcut) return;

  e.preventDefault();

  if (e.key === 'Escape') {
    recordingShortcut = false;
    const input = document.getElementById('quick-menu-shortcut');
    const settings = await browser.storage.sync.get('quickMenuShortcut');
    const shortcut = settings.quickMenuShortcut || { ctrl: true, shift: true, key: 'Space' };
    input.value = formatShortcut(shortcut);
    input.classList.remove('recording');
    return;
  }

  // Ignore modifier keys alone
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

  currentShortcut = {
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
    key: e.key === ' ' ? 'Space' : e.key
  };

  const input = document.getElementById('quick-menu-shortcut');
  input.value = formatShortcut(currentShortcut);

  // Save immediately
  await browser.storage.sync.set({ quickMenuShortcut: currentShortcut });

  // Reset recording state
  setTimeout(() => {
    recordingShortcut = false;
    input.classList.remove('recording');
    showAdvancedStatus('Shortcut saved! Reload pages to apply.', 'success');
  }, 500);
});

// Reset buttons
document.querySelectorAll('.reset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const command = btn.dataset.command;
    const textarea = document.getElementById(`prompt-${command}`);
    textarea.value = defaultPrompts[command] || '';
  });
});

// Save advanced settings
document.getElementById('save-advanced').addEventListener('click', async () => {
  try {
    const customPrompts = {
      'fix-spelling': document.getElementById('prompt-fix-spelling').value,
      'continue-writing': document.getElementById('prompt-continue-writing').value,
      'suggest-rewrites': document.getElementById('prompt-suggest-rewrites').value,
      'explain': document.getElementById('prompt-explain').value
    };

    await browser.storage.sync.set({
      customPrompts,
      includePageTitle: document.getElementById('include-page-title').checked,
      includeTextContext: document.getElementById('include-text-context').checked,
      debugMode: document.getElementById('debug-mode').checked,
      saveHistory: document.getElementById('save-history').checked,
      showContextMenu: document.getElementById('show-context-menu').checked,
      enablePopupWorkflow: document.getElementById('enable-popup-workflow').checked
    });

    showAdvancedStatus('Advanced settings saved successfully!', 'success');
  } catch (error) {
    showAdvancedStatus('Failed to save: ' + error.message, 'error');
  }
});

function showAdvancedStatus(message, type) {
  const statusEl = document.getElementById('advanced-status');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  statusEl.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
}

// Utility functions
function truncate(str, length) {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Collapsible sections
document.addEventListener('DOMContentLoaded', () => {
  const collapsibleHeaders = document.querySelectorAll('.section-title.collapsible');
  
  collapsibleHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const content = header.nextElementSibling;
      const isCollapsed = header.classList.contains('collapsed');
      
      if (isCollapsed) {
        header.classList.remove('collapsed');
        content.classList.remove('collapsed');
      } else {
        header.classList.add('collapsed');
        content.classList.add('collapsed');
      }
    });
  });
});

// Provider change handler
document.getElementById('provider').addEventListener('change', (e) => {
  updateProviderFields(e.target.value);
});

// Initialize popup - decide whether to show settings or command interface
async function initializePopup() {
  await loadTheme();

  try {
    const settings = await browser.storage.sync.get('enablePopupWorkflow');
    const popupWorkflowEnabled = settings.enablePopupWorkflow || false;

    if (popupWorkflowEnabled) {
      // Check if there's selected text on the active tab
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) {
        try {
          const response = await browser.tabs.sendMessage(tabs[0].id, { type: 'get-selection' });

          if (response && response.text && response.text.trim().length > 0) {
            // Show command interface instead of settings
            showCommandInterface(response.text, tabs[0].id);
            return;
          }
        } catch (e) {
          // Content script not loaded or error - fall through to settings
          console.log('Could not get selection:', e);
        }
      }
    }
  } catch (e) {
    console.error('Error checking popup workflow:', e);
  }

  // Default: show settings
  loadSettings();
}

// Show command interface for selected text
function showCommandInterface(selectedText, tabId) {
  // Hide the regular popup UI
  document.querySelector('.header').style.display = 'none';
  document.querySelector('.tabs').style.display = 'none';
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');

  // Create command interface
  const commandInterface = document.createElement('div');
  commandInterface.id = 'command-interface';
  commandInterface.innerHTML = `
    <div class="command-header">
      <h2>QuickAI Commands</h2>
      <p class="subtitle">Selected: "${truncate(selectedText, 50)}"</p>
    </div>
    <div class="command-list">
      <button class="command-btn" data-command="fix-spelling">
        <span class="command-icon">✓</span>
        <div class="command-text">
          <div class="command-label">Improve Writing</div>
          <div class="command-desc">Fix spelling & grammar</div>
        </div>
      </button>
      <button class="command-btn" data-command="continue-writing">
        <span class="command-icon">→</span>
        <div class="command-text">
          <div class="command-label">Continue Writing</div>
          <div class="command-desc">Continue in same style</div>
        </div>
      </button>
      <button class="command-btn" data-command="suggest-rewrites">
        <span class="command-icon">⟳</span>
        <div class="command-text">
          <div class="command-label">Suggest Rewrites</div>
          <div class="command-desc">Get alternatives</div>
        </div>
      </button>
      <button class="command-btn" data-command="explain">
        <span class="command-icon">?</span>
        <div class="command-text">
          <div class="command-label">Explain</div>
          <div class="command-desc">Get explanation</div>
        </div>
      </button>
    </div>
    <div class="command-footer">
      <button class="btn btn-secondary" id="goto-settings">Go to Settings</button>
    </div>
  `;

  document.body.appendChild(commandInterface);

  // Add styles for command interface
  const style = document.createElement('style');
  style.textContent = `
    #command-interface {
      padding: 0;
    }
    .command-header {
      padding: 20px;
      border-bottom: 1px solid #e0e0e0;
      background: #fafafa;
    }
    .command-header h2 {
      font-size: 20px;
      margin: 0 0 4px 0;
    }
    .command-header .subtitle {
      font-size: 13px;
      color: #787774;
      margin: 0;
    }
    .command-list {
      padding: 16px;
    }
    .command-btn {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      margin-bottom: 10px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
      text-align: left;
    }
    .command-btn:hover {
      background: #f7f6f3;
      border-color: #37352f;
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    }
    .command-btn:active {
      transform: translateY(0);
    }
    .command-icon {
      font-size: 20px;
      flex-shrink: 0;
    }
    .command-text {
      flex: 1;
    }
    .command-label {
      font-size: 14px;
      font-weight: 600;
      color: #37352f;
      margin-bottom: 2px;
    }
    .command-desc {
      font-size: 12px;
      color: #787774;
    }
    .command-footer {
      padding: 16px;
      border-top: 1px solid #e0e0e0;
    }
    body.dark-mode .command-header {
      background: #1a1a1a;
      border-bottom-color: #333;
    }
    body.dark-mode .command-header .subtitle {
      color: #9b9b9b;
    }
    body.dark-mode .command-btn {
      background: #2a2a2a;
      border-color: #444;
    }
    body.dark-mode .command-btn:hover {
      background: #333;
      border-color: #666;
    }
    body.dark-mode .command-label {
      color: #e4e4e4;
    }
    body.dark-mode .command-desc {
      color: #9b9b9b;
    }
    body.dark-mode .command-footer {
      border-top-color: #333;
    }
  `;
  document.head.appendChild(style);

  // Add event listeners
  document.querySelectorAll('.command-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const command = btn.dataset.command;

      // Send message to background to process
      try {
        await browser.runtime.sendMessage({
          type: 'execute-command',
          command: command,
          selectedText: selectedText,
          tabId: tabId
        });

        // Close popup after executing
        window.close();
      } catch (e) {
        console.error('Error executing command:', e);
        alert('Error: ' + e.message);
      }
    });
  });

  document.getElementById('goto-settings').addEventListener('click', () => {
    // Reload to show settings
    window.location.reload();
  });
}

// Load settings and theme on page load
initializePopup();
