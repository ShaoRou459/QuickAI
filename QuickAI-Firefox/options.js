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
      themeToggle.querySelector('.icon-sun').style.display = 'block';
      themeToggle.querySelector('.icon-moon').style.display = 'none';
    } else {
      document.body.classList.remove('dark-mode');
      themeToggle.querySelector('.icon-sun').style.display = 'none';
      themeToggle.querySelector('.icon-moon').style.display = 'block';
    }
  } catch (error) {
    console.error('Error loading theme:', error);
  }
}

async function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  const theme = isDark ? 'dark' : 'light';

  themeToggle.querySelector('.icon-sun').style.display = isDark ? 'block' : 'none';
  themeToggle.querySelector('.icon-moon').style.display = isDark ? 'none' : 'block';

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
  const settings = await browser.storage.sync.get(['provider', 'apiKey', 'baseUrl', 'model']);

  // Set provider first
  const provider = settings.provider || 'openai';
  document.getElementById('provider').value = provider;
  updateProviderFields(provider);

  // Then set other settings
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
      showStatus('✓ Connection successful! API is working correctly.', 'success');
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

// Provider change handler
document.getElementById('provider').addEventListener('change', (e) => {
  updateProviderFields(e.target.value);
});

// Load settings and theme on page load
loadTheme();
loadSettings();
