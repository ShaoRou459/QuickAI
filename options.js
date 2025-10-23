// Options page script

const form = document.getElementById('settings-form');
const statusMessage = document.getElementById('status-message');
const testButton = document.getElementById('test-connection');
const themeToggle = document.getElementById('theme-toggle');

// Theme management
async function loadTheme() {
  try {
    const { theme } = await browser.storage.sync.get('theme');
    const isDark = theme === 'dark';

    if (isDark) {
      document.body.classList.add('dark-mode');
      themeToggle.querySelector('.theme-icon').textContent = '☀️';
    } else {
      document.body.classList.remove('dark-mode');
      themeToggle.querySelector('.theme-icon').textContent = '🌙';
    }
  } catch (error) {
    console.error('Error loading theme:', error);
  }
}

async function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  const theme = isDark ? 'dark' : 'light';

  themeToggle.querySelector('.theme-icon').textContent = isDark ? '☀️' : '🌙';

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
  const settings = await browser.storage.sync.get(['apiKey', 'baseUrl', 'model']);

  if (settings.baseUrl) {
    document.getElementById('base-url').value = settings.baseUrl;
  }
  if (settings.apiKey) {
    document.getElementById('api-key').value = settings.apiKey;
  }
  if (settings.model) {
    document.getElementById('model').value = settings.model;
  }
}

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
  const model = document.getElementById('model').value || 'gpt-3.5-turbo';

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
      showStatus('✓ Connection successful! API is working correctly.', 'success');
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

// Load settings and theme on page load
loadTheme();
loadSettings();
