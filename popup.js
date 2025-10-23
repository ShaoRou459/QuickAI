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

// Load saved settings
async function loadSettings() {
  try {
    const settings = await browser.storage.sync.get(['apiKey', 'baseUrl', 'model']);

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
    const settings = {
      baseUrl: baseUrlInput.value || 'https://api.openai.com/v1',
      apiKey: apiKeyInput.value,
      model: modelInput.value || 'gpt-4o-mini'
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
  const settings = {
    baseUrl: formData.get('baseUrl') || 'https://api.openai.com/v1',
    apiKey: formData.get('apiKey'),
    model: formData.get('model') || 'gpt-3.5-turbo'
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
  const apiKey = document.getElementById('api-key').value;
  const baseUrl = document.getElementById('base-url').value || 'https://api.openai.com/v1';
  const model = document.getElementById('model').value || 'gpt-4o-mini';

  if (!apiKey) {
    showStatus('Please enter an API key first', 'error');
    return;
  }

  testButton.disabled = true;
  testButton.textContent = 'Testing...';
  showStatus('Testing connection...', 'info');

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
      })
    });

    if (response.ok) {
      showStatus('✓ Connection successful!', 'success');
    } else {
      const error = await response.json();
      showStatus('Connection failed: ' + (error.error?.message || 'Unknown error'), 'error');
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

    historyList.innerHTML = history.map(entry => {
      const date = new Date(entry.timestamp);
      const timeStr = date.toLocaleString();

      return `
        <div class="history-item">
          <div class="history-header">
            <span class="history-command">${entry.commandTitle}</span>
            <span class="history-time">${timeStr}</span>
          </div>
          <div class="history-text">
            <strong>Input:</strong> ${escapeHtml(truncate(entry.input, 100))}
          </div>
          <div class="history-text">
            <strong>Output:</strong> ${escapeHtml(truncate(entry.output, 100))}
          </div>
          <div class="history-text" style="font-size: 11px; color: #9b9a97;">
            Page: ${escapeHtml(entry.pageTitle)} • Model: ${entry.model}
          </div>
          <div class="history-actions">
            <button class="btn-small copy-history" data-text="${escapeHtml(entry.output)}">Copy Output</button>
            ${entry.prompt ? `<button class="btn-small view-prompt" data-prompt="${escapeHtml(entry.prompt)}">View Prompt</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

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
      'debugMode'
    ]);

    console.log('Loaded settings:', settings);

    const customPrompts = settings.customPrompts || {};

    // Load checkboxes
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
      debugMode: document.getElementById('debug-mode').checked
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

// Load settings and theme on page load
loadTheme();
loadSettings();
