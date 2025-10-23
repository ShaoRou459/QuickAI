// Background script for handling context menu and API calls
console.log('AI Text Assistant: Background script loading...');

const AI_COMMANDS = [
  { id: 'fix-spelling', title: 'Fix Spelling' },
  { id: 'continue-writing', title: 'Continue Writing' },
  { id: 'suggest-rewrites', title: 'Suggest Rewrites' },
  { id: 'explain', title: 'Explain' }
];

// Default prompts
const DEFAULT_PROMPTS = {
  'fix-spelling': 'Fix any spelling and grammar errors in the following text. Return only the corrected text without explanations:\n\n{text}',
  'continue-writing': 'Continue writing the following text in the same style and tone. Write 2-3 sentences:\n\n{text}',
  'suggest-rewrites': 'Suggest 3 alternative ways to rewrite the following text. Return each rewrite on a new line, numbered 1-3:\n\n{text}',
  'explain': 'Explain the following text in simple, clear terms. Write in paragraph form without using bullet points or numbered lists. Use bold for emphasis if helpful. For math, use LaTeX notation with $ for inline and $$ for display math. Do not add any preamble like "Here\'s an explanation" - just provide the explanation directly:\n\n{text}'
};

// History management
async function addToHistory(entry) {
  try {
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

// Create context menu items on installation
browser.runtime.onInstalled.addListener(() => {
  console.log('AI Text Assistant: Extension installed/updated');

  try {
    browser.contextMenus.create({
      id: 'ai-assistant-parent',
      title: 'AI Assistant',
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
async function handleAICommand(commandId, selectedText, tabId, contextInfo = {}) {
  console.log('AI Text Assistant: Handling command:', commandId, 'for tab:', tabId);

  try {
    // Get settings from storage
    const settings = await browser.storage.sync.get(['apiKey', 'baseUrl', 'model']);

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
    const result = await callOpenAIAPI(commandId, selectedText, settings, contextInfo);
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

// Call OpenAI API
async function callOpenAIAPI(commandId, text, settings, contextInfo = {}) {
  const baseUrl = settings.baseUrl || 'https://api.openai.com/v1';
  const model = settings.model || 'gpt-4o-mini';

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
  const finalPrompt = promptWithContext.replace('{text}', text);

  if (debugMode) {
    console.log('AI Text Assistant: [DEBUG] Full prompt for command', commandId, ':\n', finalPrompt);
    console.log('AI Text Assistant: [DEBUG] Context info:', contextInfo);
    console.log('AI Text Assistant: [DEBUG] Settings:', { includePageTitle, includeTextContext });
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'user',
          content: finalPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'API request failed');
  }

  const data = await response.json();
  const result = data.choices[0].message.content.trim();

  // Add to history
  await addToHistory({
    command: commandId,
    commandTitle: AI_COMMANDS.find(cmd => cmd.id === commandId)?.title || commandId,
    input: text,
    output: result,
    pageTitle: contextInfo.pageTitle || 'Unknown',
    model: model,
    prompt: debugMode ? finalPrompt : null // Only save full prompt in debug mode
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
  }
});

console.log('AI Text Assistant: Background script loaded successfully');
