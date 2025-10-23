// Content script for displaying AI results
console.log('AI Text Assistant: Content script loaded');

let currentPopup = null;
let lastSelection = null;
let selectionInfo = null; // Store selection info persistently

// Theme management
async function loadTheme() {
  try {
    const { theme } = await browser.storage.sync.get('theme');
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  } catch (error) {
    console.error('Error loading theme:', error);
  }
}

// Load theme on page load
loadTheme();

// Listen for messages from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('AI Text Assistant: Received message:', message.type);

  if (message.type === 'ai-loading') {
    showLoadingPopup();
  } else if (message.type === 'ai-result') {
    showResultPopup(message.result, message.originalText, message.command);
  } else if (message.type === 'ai-error') {
    showErrorPopup(message.error);
  } else if (message.type === 'theme-changed') {
    // Update theme when changed from popup/options
    if (message.theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  } else if (message.type === 'get-context') {
    // Return context information
    if (selectionInfo) {
      const contextResponse = {
        pageTitle: selectionInfo.pageTitle,
        contextBefore: selectionInfo.contextBefore || '',
        contextAfter: selectionInfo.contextAfter || ''
      };
      console.log('AI Text Assistant: Sending context:', contextResponse);
      sendResponse(contextResponse);
    } else {
      console.log('AI Text Assistant: No selection info, sending default');
      sendResponse({
        pageTitle: document.title,
        contextBefore: '',
        contextAfter: ''
      });
    }
    return true; // Keep message channel open for async response
  }
});

// Get surrounding context for selected text
function getSurroundingContext(selectedText, contextLength = 200) {
  const activeElement = document.activeElement;
  let beforeText = '';
  let afterText = '';

  if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
    // For input/textarea elements
    const value = activeElement.value;
    const start = activeElement.selectionStart;
    const end = activeElement.selectionEnd;

    beforeText = value.substring(Math.max(0, start - contextLength), start);
    afterText = value.substring(end, Math.min(value.length, end + contextLength));
  } else if (activeElement && activeElement.isContentEditable) {
    // For contenteditable elements
    try {
      const range = window.getSelection().getRangeAt(0);
      const container = range.commonAncestorContainer;
      const textContent = container.textContent || container.innerText || '';

      // Find the position of selected text in the container
      const selectedText = range.toString();
      const selectionStart = textContent.indexOf(selectedText);

      if (selectionStart !== -1) {
        const selectionEnd = selectionStart + selectedText.length;
        beforeText = textContent.substring(Math.max(0, selectionStart - contextLength), selectionStart);
        afterText = textContent.substring(selectionEnd, Math.min(textContent.length, selectionEnd + contextLength));
      }
    } catch (e) {
      console.error('AI Text Assistant: Error getting context from contenteditable:', e);
    }
  } else {
    // For regular text nodes - look for a larger container
    try {
      const range = window.getSelection().getRangeAt(0);
      const container = range.commonAncestorContainer;

      // Try to find a larger container (paragraph, div, etc.) for better context
      let contextElement = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

      // Walk up the DOM tree to find a better context container
      // Stop at paragraph, div, article, section, or when we have enough text
      while (contextElement && contextElement !== document.body) {
        const textLength = (contextElement.textContent || '').length;
        const tagName = contextElement.tagName?.toLowerCase();

        // Stop if we have a good context container or enough text
        if (textLength > contextLength * 3 ||
            ['p', 'div', 'article', 'section', 'blockquote', 'li'].includes(tagName)) {
          break;
        }

        contextElement = contextElement.parentElement;
      }

      if (contextElement) {
        const textContent = contextElement.textContent || '';
        const selectedText = range.toString();
        const selectionStart = textContent.indexOf(selectedText);

        if (selectionStart !== -1) {
          const selectionEnd = selectionStart + selectedText.length;
          beforeText = textContent.substring(Math.max(0, selectionStart - contextLength), selectionStart);
          afterText = textContent.substring(selectionEnd, Math.min(textContent.length, selectionEnd + contextLength));
        }
      }
    } catch (e) {
      console.error('AI Text Assistant: Error getting context:', e);
    }
  }

  return {
    before: beforeText.trim(),
    after: afterText.trim()
  };
}

// Capture selection information when context menu is opened
document.addEventListener('contextmenu', (e) => {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const selectedText = selection.toString();
    const context = getSurroundingContext(selectedText);

    selectionInfo = {
      range: range.cloneRange(),
      text: selectedText,
      pageTitle: document.title,
      contextBefore: context.before,
      contextAfter: context.after,
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      },
      scrollX: window.scrollX || window.pageXOffset,
      scrollY: window.scrollY || window.pageYOffset,
      timestamp: Date.now()
    };

    console.log('AI Text Assistant: Selection captured', {
      text: selectedText,
      pageTitle: document.title,
      contextBefore: context.before,
      contextAfter: context.after
    });
  }
});

// Show loading popup
function showLoadingPopup() {
  console.log('AI Text Assistant: Showing loading popup');
  removeExistingPopup();

  if (!selectionInfo) {
    console.error('AI Text Assistant: No selection info available');
    return;
  }

  lastSelection = selectionInfo;

  const popup = createPopup();
  popup.innerHTML = `
    <div class="ai-popup-content">
      <div class="ai-popup-loading">
        <div class="ai-spinner"></div>
        <span>Generating...</span>
      </div>
    </div>
  `;

  positionPopup(popup, selectionInfo.rect, selectionInfo.scrollX, selectionInfo.scrollY);
  document.body.appendChild(popup);
  currentPopup = popup;

  console.log('AI Text Assistant: Loading popup shown');
}

// Show result popup
function showResultPopup(result, originalText, command) {
  console.log('AI Text Assistant: Showing result popup');
  removeExistingPopup();

  if (!selectionInfo && !lastSelection) {
    console.error('AI Text Assistant: No selection info available for result');
    return;
  }

  const info = lastSelection || selectionInfo;

  const popup = createPopup();

  // Render markdown and LaTeX for explain command, otherwise use plain text
  const formattedResult = command === 'explain' ? renderFormattedText(result) : escapeHtml(result);

  // Determine button text and behavior based on command
  const isExplain = command === 'explain';
  const isContinueWriting = command === 'continue-writing';
  const primaryButtonText = isExplain ? 'Dismiss' : 'Accept';

  popup.innerHTML = `
    <div class="ai-popup-content">
      <div class="ai-popup-result">${formattedResult}</div>
      <div class="ai-popup-actions">
        <button class="ai-btn ai-btn-primary" data-action="accept">${primaryButtonText}</button>
        <button class="ai-btn ai-btn-secondary" data-action="copy">Copy</button>
      </div>
    </div>
  `;

  // Add event listeners
  popup.querySelector('[data-action="accept"]').addEventListener('click', () => {
    if (isExplain) {
      // Just dismiss the popup for explain
      removeExistingPopup();
    } else if (isContinueWriting) {
      // Insert after selection for continue writing
      insertAfterText(result);
      removeExistingPopup();
    } else {
      // Replace selection for other commands
      acceptText(result);
      removeExistingPopup();
    }
  });

  popup.querySelector('[data-action="copy"]').addEventListener('click', () => {
    copyToClipboard(result);
    removeExistingPopup();
  });

  positionPopup(popup, info.rect, info.scrollX, info.scrollY);
  document.body.appendChild(popup);
  currentPopup = popup;

  console.log('AI Text Assistant: Result popup shown');
}

// Show error popup
function showErrorPopup(error) {
  console.log('AI Text Assistant: Showing error popup:', error);
  removeExistingPopup();

  if (!selectionInfo && !lastSelection) {
    console.error('AI Text Assistant: No selection info available for error');
    // Show a fallback notification
    alert('AI Text Assistant Error: ' + error);
    return;
  }

  const info = lastSelection || selectionInfo;

  const popup = createPopup();
  popup.innerHTML = `
    <div class="ai-popup-content">
      <div class="ai-popup-error">${escapeHtml(error)}</div>
    </div>
  `;

  positionPopup(popup, info.rect, info.scrollX, info.scrollY);
  document.body.appendChild(popup);
  currentPopup = popup;

  console.log('AI Text Assistant: Error popup shown');
}

// Create popup element
function createPopup() {
  const popup = document.createElement('div');
  popup.className = 'ai-assistant-popup';
  return popup;
}

// Position popup below selected text with smart positioning
function positionPopup(popup, rect, scrollX, scrollY) {
  // Use stored scroll values if provided, otherwise get current
  const currentScrollX = scrollX !== undefined ? scrollX : (window.scrollX || window.pageXOffset);
  const currentScrollY = scrollY !== undefined ? scrollY : (window.scrollY || window.pageYOffset);

  // Set up popup for measurement
  popup.style.position = 'absolute';
  popup.style.zIndex = '2147483647'; // Maximum z-index
  popup.style.visibility = 'hidden';

  // Temporarily append to body to measure if needed
  const tempAppend = !popup.parentElement;
  if (tempAppend) {
    document.body.appendChild(popup);
  }

  // Get popup dimensions
  const popupRect = popup.getBoundingClientRect();
  const popupWidth = popupRect.width;
  const popupHeight = popupRect.height;

  // Get viewport dimensions
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Padding from viewport edges
  const edgePadding = 8;
  const selectionGap = 8;

  // Calculate preferred position: below selection, aligned to left edge
  let left = rect.left + currentScrollX;
  let top = rect.bottom + currentScrollY + selectionGap;
  let positionedAbove = false;

  // Check if popup fits below the selection in viewport
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;

  if (spaceBelow < popupHeight + selectionGap && spaceAbove > spaceBelow) {
    // Position above selection if more space available
    top = rect.top + currentScrollY - popupHeight - selectionGap;
    positionedAbove = true;
  }

  // Adjust horizontal position if popup goes off right edge
  if (rect.left + popupWidth > viewportWidth - edgePadding) {
    // Try to align to right edge of selection
    left = rect.right + currentScrollX - popupWidth;

    // If still off-screen, align to viewport right edge
    if (left < currentScrollX + edgePadding) {
      left = currentScrollX + viewportWidth - popupWidth - edgePadding;
    }
  }

  // Ensure popup doesn't go off left edge
  if (left < currentScrollX + edgePadding) {
    left = currentScrollX + edgePadding;
  }

  // Ensure popup doesn't go off top edge (only if positioned above)
  if (positionedAbove && top < currentScrollY + edgePadding) {
    top = currentScrollY + edgePadding;
  }

  // Apply final position
  popup.style.left = `${Math.round(left)}px`;
  popup.style.top = `${Math.round(top)}px`;
  popup.style.visibility = 'visible';

  // Remove temporary append
  if (tempAppend) {
    popup.remove();
  }
}

// Remove existing popup
function removeExistingPopup() {
  if (currentPopup) {
    currentPopup.remove();
    currentPopup = null;
  }
}

// Accept text and replace selection
function acceptText(text) {
  if (!lastSelection || !lastSelection.range) {
    console.error('AI Text Assistant: No selection to replace');
    return;
  }

  const range = lastSelection.range;
  const selection = window.getSelection();

  // Try to find the active input/textarea element
  const activeElement = document.activeElement;

  if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
    // For input/textarea elements
    const start = activeElement.selectionStart;
    const end = activeElement.selectionEnd;
    const currentValue = activeElement.value;

    activeElement.value = currentValue.substring(0, start) + text + currentValue.substring(end);
    activeElement.selectionStart = activeElement.selectionEnd = start + text.length;

    // Trigger events
    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    activeElement.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (activeElement && activeElement.isContentEditable) {
    // For contenteditable elements
    try {
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, text);
    } catch (e) {
      console.error('AI Text Assistant: Error replacing text:', e);
    }
  } else {
    // Fallback: try to select and replace
    try {
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, text);
    } catch (e) {
      console.error('AI Text Assistant: Error replacing text:', e);
      // Last resort: copy to clipboard
      copyToClipboard(text);
      alert('Text has been copied to clipboard (direct replacement not supported on this element)');
    }
  }
}

// Insert text after selection (for continue writing)
function insertAfterText(text) {
  if (!lastSelection || !lastSelection.range) {
    console.error('AI Text Assistant: No selection to insert after');
    return;
  }

  const range = lastSelection.range;
  const selection = window.getSelection();

  // Try to find the active input/textarea element
  const activeElement = document.activeElement;

  if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
    // For input/textarea elements
    const end = activeElement.selectionEnd;
    const currentValue = activeElement.value;

    // Insert after the selection, with a space if needed
    const prefix = currentValue.substring(0, end);
    const suffix = currentValue.substring(end);
    const separator = prefix.endsWith(' ') ? '' : ' ';

    activeElement.value = prefix + separator + text + suffix;
    activeElement.selectionStart = activeElement.selectionEnd = end + separator.length + text.length;

    // Trigger events
    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    activeElement.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (activeElement && activeElement.isContentEditable) {
    // For contenteditable elements
    try {
      selection.removeAllRanges();
      selection.addRange(range);
      selection.collapseToEnd();
      document.execCommand('insertText', false, ' ' + text);
    } catch (e) {
      console.error('AI Text Assistant: Error inserting text:', e);
    }
  } else {
    // Fallback: try to insert at end of selection
    try {
      selection.removeAllRanges();
      selection.addRange(range);
      selection.collapseToEnd();
      document.execCommand('insertText', false, ' ' + text);
    } catch (e) {
      console.error('AI Text Assistant: Error inserting text:', e);
      // Last resort: copy to clipboard
      copyToClipboard(text);
      alert('Text has been copied to clipboard (direct insertion not supported on this element)');
    }
  }
}

// Copy text to clipboard
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    console.log('AI Text Assistant: Text copied to clipboard');
    showTemporaryMessage('Copied to clipboard!');
  }).catch(err => {
    console.error('AI Text Assistant: Failed to copy text:', err);
  });
}

// Show temporary success message
function showTemporaryMessage(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #22863a;
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Render markdown and LaTeX formatted text
function renderFormattedText(text) {
  try {
    // First, render LaTeX math expressions
    // Replace display math $$...$$ with placeholders
    const displayMathPlaceholders = [];
    text = text.replace(/\$\$(.*?)\$\$/gs, (match, math) => {
      const placeholder = `__DISPLAYMATH${displayMathPlaceholders.length}__`;
      displayMathPlaceholders.push(math);
      return placeholder;
    });

    // Replace inline math $...$ with placeholders
    const inlineMathPlaceholders = [];
    text = text.replace(/\$([^\$\n]+?)\$/g, (match, math) => {
      const placeholder = `__INLINEMATH${inlineMathPlaceholders.length}__`;
      inlineMathPlaceholders.push(math);
      return placeholder;
    });

    // Configure marked to use tight lists (no paragraphs in list items)
    // by setting pedantic to false and gfm to true
    marked.setOptions({
      gfm: true,
      breaks: false,
      pedantic: false
    });

    // Render markdown to HTML
    let html = marked.parse(text);

    // Clean up excessive spacing from markdown parser
    html = html.trim();

    // AGGRESSIVE cleanup: Remove ALL paragraph tags inside list items
    // This handles both simple and complex nested content
    html = html.replace(/<li>[\s\n]*<p>([\s\S]*?)<\/p>[\s\n]*<\/li>/g, '<li>$1</li>');

    // Handle multiple paragraphs in single list item (convert to line breaks)
    html = html.replace(/<li>([\s\S]*?)<\/li>/g, (match, content) => {
      // Remove paragraph tags within list items and replace with line breaks
      const cleaned = content.replace(/<p>([\s\S]*?)<\/p>/g, (m, p) => p + '<br>');
      // Remove trailing <br> tags
      return '<li>' + cleaned.replace(/(<br>)+$/g, '') + '</li>';
    });

    // Remove empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');

    // Remove multiple consecutive line breaks
    html = html.replace(/(<\/p>)\s*(<p>)/g, '$1$2');

    // If there's only one paragraph wrapper and no other block elements, unwrap it
    const singleParagraphMatch = html.match(/^<p>(.*)<\/p>$/s);
    if (singleParagraphMatch && !singleParagraphMatch[1].includes('<p>') && !singleParagraphMatch[1].includes('<div>')) {
      // Check if content has block-level elements
      if (!/<(h[1-6]|ul|ol|blockquote|pre|table)/.test(singleParagraphMatch[1])) {
        html = singleParagraphMatch[1];
      }
    }

    // Restore and render display math
    displayMathPlaceholders.forEach((math, index) => {
      const placeholder = `__DISPLAYMATH${index}__`;
      try {
        const rendered = katex.renderToString(math, {
          displayMode: true,
          throwOnError: false
        });
        html = html.replace(placeholder, rendered);
      } catch (e) {
        console.error('KaTeX display math error:', e);
        html = html.replace(placeholder, `$$${escapeHtml(math)}$$`);
      }
    });

    // Restore and render inline math
    inlineMathPlaceholders.forEach((math, index) => {
      const placeholder = `__INLINEMATH${index}__`;
      try {
        const rendered = katex.renderToString(math, {
          displayMode: false,
          throwOnError: false
        });
        html = html.replace(placeholder, rendered);
      } catch (e) {
        console.error('KaTeX inline math error:', e);
        html = html.replace(placeholder, `$${escapeHtml(math)}$`);
      }
    });

    return html;
  } catch (error) {
    console.error('Error rendering formatted text:', error);
    return escapeHtml(text);
  }
}

// Close popup when clicking outside
document.addEventListener('click', (e) => {
  if (currentPopup && !currentPopup.contains(e.target)) {
    removeExistingPopup();
  }
}, true);

// Close popup on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && currentPopup) {
    removeExistingPopup();
  }
});

console.log('AI Text Assistant: Content script initialized');
