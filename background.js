// Background script for handling context menu and API calls
console.log('AI Text Assistant: Background script loading...');

const AI_COMMANDS = [
  { id: 'fix-spelling', title: 'Improve Writing' },
  { id: 'continue-writing', title: 'Continue Writing' },
  { id: 'suggest-rewrites', title: 'Suggest Rewrites' },
  { id: 'explain', title: 'Explain' },
  { id: 'custom', title: 'Custom' }
];

// AI Provider configurations
const AI_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    authHeader: 'Bearer',
    formatRequest: (model, messages, temperature = 0.7, maxTokens = 500) => ({
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens
    }),
    extractResponse: (data) => data.choices[0].message.content.trim()
  },
  anthropic: {
    name: 'Anthropic Claude',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
    authHeader: 'Bearer',
    formatRequest: (model, messages, temperature = 0.7, maxTokens = 500) => ({
      model: model,
      max_tokens: maxTokens,
      temperature: temperature,
      messages: messages
    }),
    extractResponse: (data) => data.content[0].text.trim()
  },
  google: {
    name: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-pro',
    authHeader: 'Bearer',
    formatRequest: (model, messages, temperature = 0.7, maxTokens = 500) => {
      // Convert OpenAI message format to Gemini format
      const contents = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));
      
      return {
        contents: contents,
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: maxTokens
        }
      };
    },
    extractResponse: (data) => data.candidates[0].content.parts[0].text.trim()
  }
};

// Default prompts
const DEFAULT_PROMPTS = {
  'fix-spelling': 'Fix any spelling and grammar errors in the following text. Return only the corrected text without explanations:\n\n{text}',
  'continue-writing': 'Continue writing the following text in the same style and tone. Write 2-3 sentences:\n\n{text}',
  'suggest-rewrites': 'Suggest 3 alternative ways to rewrite the following text. Return each rewrite on a new line, numbered 1-3:\n\n{text}',
  'explain': 'Explain the following text in simple, clear terms. Write in paragraph form without using bullet points or numbered lists. Use bold for emphasis if helpful. For math, use LaTeX notation with $ for inline and $$ for display math. Do not add any preamble like "Here\'s an explanation" - just provide the explanation directly:\n\n{text}',
  'custom': '{instructions}\n\n{text}'
};

// Parse API errors with actionable messages
function parseAPIError(status, errorData, provider) {
  const errorMessage = errorData.error?.message || errorData.message || '';
  const errorType = errorData.error?.type || errorData.type || '';
  const errorCode = errorData.error?.code || errorData.code || '';

  // Handle common HTTP status codes
  if (status === 401) {
    return `❌ Invalid API Key\n\nYour API key is incorrect or expired.\n→ Click the extension icon and go to Settings to update your key`;
  }

  if (status === 403) {
    return `❌ Access Denied\n\nYour API key doesn't have permission to access this model.\n→ Check your account permissions or try a different model`;
  }

  if (status === 429) {
    // Rate limit - check if we have retry info
    const retryAfter = errorData.error?.retry_after || null;
    if (retryAfter) {
      return `❌ Rate Limit Exceeded\n\nToo many requests. Please wait ${retryAfter} seconds.\n→ Consider upgrading your API plan for higher limits`;
    }
    return `❌ Rate Limit Exceeded\n\nYou've hit your API rate limit.\n→ Wait a few moments and try again\n→ Consider upgrading your API plan`;
  }

  if (status === 400) {
    // Bad request - provide specific guidance
    if (errorMessage.toLowerCase().includes('model') || errorCode === 'model_not_found') {
      return `❌ Invalid Model\n\nThe selected model doesn't exist or isn't available.\n→ Go to Settings and choose a different model`;
    }
    if (errorMessage.toLowerCase().includes('token') || errorCode === 'context_length_exceeded') {
      return `❌ Text Too Long\n\nYour selection exceeds the model's token limit.\n→ Try selecting less text\n→ Consider using a model with a larger context window`;
    }
    if (errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('authentication')) {
      return `❌ API Key Error\n\nThere's a problem with your API key format.\n→ Go to Settings and verify your API key is correct`;
    }
    return `❌ Invalid Request\n\n${errorMessage || 'The request format was invalid'}\n→ Try again or check extension settings`;
  }

  if (status === 404) {
    return `❌ Endpoint Not Found\n\nThe API endpoint doesn't exist.\n→ Check that your Base URL is correct in Settings\n→ Verify you're using the right provider`;
  }

  if (status === 500 || status === 502 || status === 503) {
    return `❌ Server Error\n\nThe AI provider's server is experiencing issues.\n→ Wait a few moments and try again\n→ Check ${provider === 'openai' ? 'status.openai.com' : provider === 'anthropic' ? 'status.anthropic.com' : 'the provider status page'}`;
  }

  if (status === 504) {
    return `❌ Request Timeout\n\nThe request took too long to complete.\n→ Try with less text\n→ Check your internet connection`;
  }

  // Network errors
  if (status === 0 || !status) {
    return `❌ Network Error\n\nCouldn't connect to the AI service.\n→ Check your internet connection\n→ Verify the Base URL in Settings`;
  }

  // Fallback with any available error message
  if (errorMessage) {
    return `❌ Error\n\n${errorMessage}\n→ Check extension settings\n→ Try again in a moment`;
  }

  return `❌ Unknown Error (${status})\n\nSomething went wrong with the API request.\n→ Check extension settings\n→ Verify your API key and configuration`;
}

// History management
async function addToHistory(entry) {
  try {
    // Check if history saving is enabled
    const { saveHistory } = await browser.storage.sync.get('saveHistory');
    if (saveHistory === false) {
      console.log('AI Text Assistant: History saving is disabled');
      return;
    }

    const { history = [] } = await browser.storage.local.get('history');

    // Add new entry with timestamp
    const newEntry = {
      ...entry,
      timestamp: Date.now(),
      id: Date.now() + Math.random() // Unique ID
    };

    // Keep last 100 entries
    const updatedHistory = [newEntry, ...history].slice(0, 100);

    await browser.storage.local.set({ history: updatedHistory });
    console.log('AI Text Assistant: Added to history:', newEntry);
  } catch (error) {
    console.error('AI Text Assistant: Error saving to history:', error);
  }
}

async function getHistory() {
  try {
    const { history = [] } = await browser.storage.local.get('history');
    return history;
  } catch (error) {
    console.error('AI Text Assistant: Error getting history:', error);
    return [];
  }
}

async function clearHistory() {
  try {
    await browser.storage.local.set({ history: [] });
    console.log('AI Text Assistant: History cleared');
  } catch (error) {
    console.error('AI Text Assistant: Error clearing history:', error);
  }
}

// Create context menu items
async function createContextMenus() {
  try {
    // Check if context menu should be shown
    const { showContextMenu } = await browser.storage.sync.get('showContextMenu');

    // Remove existing menus first
    await browser.contextMenus.removeAll();

    if (showContextMenu === false) {
      console.log('AI Text Assistant: Context menu disabled by user');
      return;
    }

    browser.contextMenus.create({
      id: 'ai-assistant-parent',
      title: 'QuickAI',
      contexts: ['selection']
    });

    AI_COMMANDS.forEach(command => {
      browser.contextMenus.create({
        id: command.id,
        parentId: 'ai-assistant-parent',
        title: command.title,
        contexts: ['selection']
      });
    });

    console.log('AI Text Assistant: Context menus created');
  } catch (error) {
    console.error('AI Text Assistant: Error creating context menus:', error);
  }
}

// Create context menu items on installation
browser.runtime.onInstalled.addListener(() => {
  console.log('AI Text Assistant: Extension installed/updated');
  createContextMenus();
});

// Create context menus on startup (browser restart)
browser.runtime.onStartup.addListener(() => {
  console.log('AI Text Assistant: Extension starting up');
  createContextMenus();
});

// Also create menus immediately when background script loads
createContextMenus();

// Listen for settings changes
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.showContextMenu) {
    console.log('AI Text Assistant: Context menu setting changed');
    createContextMenus();
  }
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('AI Text Assistant: Menu clicked:', info.menuItemId);

  if (AI_COMMANDS.some(cmd => cmd.id === info.menuItemId)) {
    const selectedText = info.selectionText;

    // Request context information from content script
    let contextInfo = { pageTitle: tab.title };
    try {
      const response = await browser.tabs.sendMessage(tab.id, { type: 'get-context' });
      if (response && response.contextBefore !== undefined) {
        contextInfo = response;
        console.log('AI Text Assistant: Received context from content script:', contextInfo);
      }
    } catch (err) {
      console.log('AI Text Assistant: Could not get context from content script, using defaults', err);
    }

    handleAICommand(info.menuItemId, selectedText, tab.id, contextInfo);
  }
});

// Send message to content script with retry
async function sendMessageToTab(tabId, message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await browser.tabs.sendMessage(tabId, message);
      console.log('AI Text Assistant: Message sent successfully:', message.type);
      return true;
    } catch (err) {
      console.error(`AI Text Assistant: Failed to send message (attempt ${i + 1}/${retries}):`, err);

      if (i < retries - 1) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        // Last attempt failed - try to inject content script
        console.log('AI Text Assistant: Attempting to inject content script...');
        try {
          await browser.tabs.executeScript(tabId, { file: 'content.js' });
          await browser.tabs.insertCSS(tabId, { file: 'content.css' });
          // Wait a bit for script to initialize
          await new Promise(resolve => setTimeout(resolve, 200));
          // Try one more time
          await browser.tabs.sendMessage(tabId, message);
          console.log('AI Text Assistant: Message sent after injection');
          return true;
        } catch (injectErr) {
          console.error('AI Text Assistant: Failed to inject content script:', injectErr);
          return false;
        }
      }
    }
  }
  return false;
}

// Handle AI command execution
async function handleAICommand(commandId, selectedText, tabId, contextInfo = {}, customInstructions = null) {
  console.log('AI Text Assistant: Handling command:', commandId, 'for tab:', tabId);

  try {
    // Get settings from storage
    const settings = await browser.storage.sync.get(['apiKey', 'baseUrl', 'model', 'provider']);

    if (!settings.apiKey) {
      console.log('AI Text Assistant: No API key configured');
      const sent = await sendMessageToTab(tabId, {
        type: 'ai-error',
        error: 'Please configure your API key in the extension settings.'
      });
      if (!sent) {
        console.error('AI Text Assistant: Could not send error message to tab');
      }
      return;
    }

    // Show loading state
    console.log('AI Text Assistant: Sending loading message...');
    const loadingSent = await sendMessageToTab(tabId, {
      type: 'ai-loading',
      command: commandId
    });

    if (!loadingSent) {
      console.error('AI Text Assistant: Failed to show loading state');
      return;
    }

    // Make API call
    console.log('AI Text Assistant: Calling API...');
    const result = await callAIAPI(commandId, selectedText, settings, contextInfo, customInstructions);
    console.log('AI Text Assistant: API call successful, result length:', result.length);

    // Send result to content script
    const resultSent = await sendMessageToTab(tabId, {
      type: 'ai-result',
      command: commandId,
      result: result,
      originalText: selectedText
    });

    if (!resultSent) {
      console.error('AI Text Assistant: Failed to send result to tab');
    }
  } catch (error) {
    console.error('AI Text Assistant: Error in handleAICommand:', error);
    await sendMessageToTab(tabId, {
      type: 'ai-error',
      error: error.message
    });
  }
}

// Call AI API with provider support
async function callAIAPI(commandId, text, settings, contextInfo = {}, customInstructions = null) {
  const provider = settings.provider || 'openai';
  const providerConfig = AI_PROVIDERS[provider];

  if (!providerConfig) {
    throw new Error(`Unknown AI provider: ${provider}`);
  }

  const baseUrl = settings.baseUrl || providerConfig.defaultBaseUrl;
  const model = settings.model || providerConfig.defaultModel;

  // Get advanced settings
  const advancedSettings = await browser.storage.sync.get([
    'customPrompts',
    'includePageTitle',
    'includeTextContext',
    'debugMode'
  ]);

  const customPrompts = advancedSettings.customPrompts || {};
  const includePageTitle = advancedSettings.includePageTitle !== false; // default true
  const includeTextContext = advancedSettings.includeTextContext !== false; // default true
  const debugMode = advancedSettings.debugMode || false;

  // Build context information string
  let contextStr = '';
  if (includePageTitle && contextInfo.pageTitle) {
    contextStr += `Page: ${contextInfo.pageTitle}\n`;
  }
  if (includeTextContext && (contextInfo.contextBefore || contextInfo.contextAfter)) {
    contextStr += '\nText context:\n';
    if (contextInfo.contextBefore) {
      contextStr += `...${contextInfo.contextBefore}`;
    }
    contextStr += `[${text}]`;
    if (contextInfo.contextAfter) {
      contextStr += `${contextInfo.contextAfter}...`;
    }
    contextStr += '\n';
  }

  const contextPrefix = contextStr ? `Context:\n${contextStr}\n` : '';

  // Use custom prompts if available, otherwise use defaults
  const promptTemplate = customPrompts[commandId] || DEFAULT_PROMPTS[commandId];
  const promptWithContext = `${contextPrefix}${promptTemplate}`;
  let finalPrompt = promptWithContext.replace('{text}', text);

  // For custom command, replace the {instructions} placeholder
  if (commandId === 'custom' && customInstructions) {
    finalPrompt = finalPrompt.replace('{instructions}', customInstructions);
  }

  if (debugMode) {
    console.log('AI Text Assistant: [DEBUG] Full prompt for command', commandId, ':\n', finalPrompt);
    console.log('AI Text Assistant: [DEBUG] Context info:', contextInfo);
    console.log('AI Text Assistant: [DEBUG] Settings:', { includePageTitle, includeTextContext });
    console.log('AI Text Assistant: [DEBUG] Provider:', provider, 'Model:', model);
  }

  // Prepare request based on provider
  const messages = [{ role: 'user', content: finalPrompt }];
  const requestBody = providerConfig.formatRequest(model, messages, 0.7, 500);
  
  // Determine API endpoint based on provider
  let apiEndpoint;
  if (provider === 'google') {
    apiEndpoint = `${baseUrl}/models/${model}:generateContent`;
  } else if (provider === 'anthropic') {
    apiEndpoint = `${baseUrl}/messages`;
  } else {
    apiEndpoint = `${baseUrl}/chat/completions`;
  }

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `${providerConfig.authHeader} ${settings.apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = {};
    }

    const errorMessage = parseAPIError(response.status, errorData, provider);
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const result = providerConfig.extractResponse(data);

  // Add to history
  await addToHistory({
    command: commandId,
    commandTitle: AI_COMMANDS.find(cmd => cmd.id === commandId)?.title || commandId,
    input: text,
    output: result,
    pageTitle: contextInfo.pageTitle || 'Unknown',
    model: model,
    provider: providerConfig.name,
    prompt: debugMode ? finalPrompt : null // Only save full prompt in debug mode
  });

  return result;
}

// Handle reprompt command with additional instructions
async function handleRepromptCommand(commandId, selectedText, additionalInstructions, currentResult, tabId, contextInfo = {}) {
  console.log('AI Text Assistant: Handling reprompt command:', commandId, 'for tab:', tabId);

  try {
    // Get settings from storage
    const settings = await browser.storage.sync.get(['apiKey', 'baseUrl', 'model', 'provider']);

    if (!settings.apiKey) {
      console.log('AI Text Assistant: No API key configured');
      const sent = await sendMessageToTab(tabId, {
        type: 'ai-error',
        error: 'Please configure your API key in the extension settings.'
      });
      if (!sent) {
        console.error('AI Text Assistant: Could not send error message to tab');
      }
      return;
    }

    // Show loading state
    console.log('AI Text Assistant: Sending loading message for reprompt...');
    const loadingSent = await sendMessageToTab(tabId, {
      type: 'ai-loading',
      command: commandId
    });

    if (!loadingSent) {
      console.error('AI Text Assistant: Failed to show loading state for reprompt');
      return;
    }

    // Make API call with additional instructions
    console.log('AI Text Assistant: Calling API with additional instructions...');
    const result = await callAIAPIWithReprompt(commandId, selectedText, additionalInstructions, currentResult, settings, contextInfo);
    console.log('AI Text Assistant: Reprompt API call successful, result length:', result.length);

    // Send result to content script
    const resultSent = await sendMessageToTab(tabId, {
      type: 'ai-result',
      command: commandId,
      result: result,
      originalText: selectedText
    });

    if (!resultSent) {
      console.error('AI Text Assistant: Failed to send reprompt result to tab');
    }
  } catch (error) {
    console.error('AI Text Assistant: Error in handleRepromptCommand:', error);
    await sendMessageToTab(tabId, {
      type: 'ai-error',
      error: error.message
    });
  }
}

// Call AI API with additional instructions
async function callAIAPIWithReprompt(commandId, text, additionalInstructions, currentResult, settings, contextInfo = {}) {
  const provider = settings.provider || 'openai';
  const providerConfig = AI_PROVIDERS[provider];
  
  if (!providerConfig) {
    throw new Error(`Unknown AI provider: ${provider}`);
  }

  const baseUrl = settings.baseUrl || providerConfig.defaultBaseUrl;
  const model = settings.model || providerConfig.defaultModel;

  // Get advanced settings
  const advancedSettings = await browser.storage.sync.get([
    'customPrompts',
    'includePageTitle',
    'includeTextContext',
    'debugMode'
  ]);

  const customPrompts = advancedSettings.customPrompts || {};
  const includePageTitle = advancedSettings.includePageTitle !== false; // default true
  const includeTextContext = advancedSettings.includeTextContext !== false; // default true
  const debugMode = advancedSettings.debugMode || false;

  // Build context information string
  let contextStr = '';
  if (includePageTitle && contextInfo.pageTitle) {
    contextStr += `Page: ${contextInfo.pageTitle}\n`;
  }
  if (includeTextContext && (contextInfo.contextBefore || contextInfo.contextAfter)) {
    contextStr += '\nText context:\n';
    if (contextInfo.contextBefore) {
      contextStr += `...${contextInfo.contextBefore}`;
    }
    contextStr += `[${text}]`;
    if (contextInfo.contextAfter) {
      contextStr += `${contextInfo.contextAfter}...`;
    }
    contextStr += '\n';
  }

  const contextPrefix = contextStr ? `Context:\n${contextStr}\n` : '';

  // Use custom prompts if available, otherwise use defaults
  const promptTemplate = customPrompts[commandId] || DEFAULT_PROMPTS[commandId];
  
  // Build reprompt with additional instructions
  const repromptPrompt = `${contextPrefix}Original request: ${promptTemplate.replace('{text}', text)}

Previous result:
${currentResult}

Additional instructions: ${additionalInstructions}

Please provide a new response that incorporates the additional instructions while still addressing the original request.`;

  if (debugMode) {
    console.log('AI Text Assistant: [DEBUG] Reprompt prompt for command', commandId, ':\n', repromptPrompt);
    console.log('AI Text Assistant: [DEBUG] Context info:', contextInfo);
    console.log('AI Text Assistant: [DEBUG] Settings:', { includePageTitle, includeTextContext });
    console.log('AI Text Assistant: [DEBUG] Provider:', provider, 'Model:', model);
  }

  // Prepare request based on provider
  const messages = [{ role: 'user', content: repromptPrompt }];
  const requestBody = providerConfig.formatRequest(model, messages, 0.7, 500);
  
  // Determine API endpoint based on provider
  let apiEndpoint;
  if (provider === 'google') {
    apiEndpoint = `${baseUrl}/models/${model}:generateContent`;
  } else if (provider === 'anthropic') {
    apiEndpoint = `${baseUrl}/messages`;
  } else {
    apiEndpoint = `${baseUrl}/chat/completions`;
  }

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `${providerConfig.authHeader} ${settings.apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = {};
    }

    const errorMessage = parseAPIError(response.status, errorData, provider);
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const result = providerConfig.extractResponse(data);

  // Add to history with reprompt indicator
  await addToHistory({
    command: commandId,
    commandTitle: AI_COMMANDS.find(cmd => cmd.id === commandId)?.title + ' (Reprompted)' || commandId + ' (Reprompted)',
    input: text + '\n\nAdditional instructions: ' + additionalInstructions,
    output: result,
    pageTitle: contextInfo.pageTitle || 'Unknown',
    model: model,
    provider: providerConfig.name,
    prompt: debugMode ? repromptPrompt : null // Only save full prompt in debug mode
  });

  return result;
}

// Listen for messages from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('AI Text Assistant: Received message:', message.type);

  if (message.type === 'open-settings') {
    browser.runtime.openOptionsPage();
  } else if (message.type === 'get-history') {
    getHistory().then(history => {
      console.log('AI Text Assistant: Sending history, entries:', history.length);
      sendResponse({ history });
    }).catch(error => {
      console.error('AI Text Assistant: Error getting history:', error);
      sendResponse({ history: [] });
    });
    return true; // Keep channel open for async response
  } else if (message.type === 'clear-history') {
    clearHistory().then(() => {
      console.log('AI Text Assistant: History cleared');
      sendResponse({ success: true });
    }).catch(error => {
      console.error('AI Text Assistant: Error clearing history:', error);
      sendResponse({ success: false });
    });
    return true; // Keep channel open for async response
  } else if (message.type === 'get-default-prompts') {
    console.log('AI Text Assistant: Sending default prompts');
    sendResponse({ prompts: DEFAULT_PROMPTS });
    return false; // Synchronous response
  } else if (message.type === 'regenerate-response') {
    // Handle regeneration request
    handleAICommand(message.command, message.selectedText, sender.tab.id, message.contextInfo);
    return false;
  } else if (message.type === 'reprompt-response') {
    // Handle reprompt request with additional instructions
    handleRepromptCommand(message.command, message.selectedText, message.additionalInstructions,
                         message.currentResult, sender.tab.id, message.contextInfo);
    return false;
  } else if (message.type === 'execute-command') {
    // Handle command execution from popup workflow
    const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
    if (tabId) {
      // Get context from the tab
      browser.tabs.sendMessage(tabId, { type: 'get-context' }).then(contextInfo => {
        handleAICommand(message.command, message.selectedText, tabId, contextInfo || {}, message.customInstructions);
      }).catch(error => {
        console.error('AI Text Assistant: Error getting context:', error);
        // Execute anyway with minimal context
        handleAICommand(message.command, message.selectedText, tabId, {}, message.customInstructions);
      });
    }
    return false;
  }
});

console.log('AI Text Assistant: Background script loaded successfully');
