// Content script for displaying AI results
console.log('AI Text Assistant: Content script loaded');

let currentPopup = null;
let lastSelection = null;
let selectionInfo = null; // Store selection info persistently
let undoState = null; // Store undo information
let currentToast = null; // Store current toast notification

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
  } else if (message.type === 'get-selection') {
    // Return current selection for popup workflow
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText) {
      const context = getSurroundingContext(selectedText);
      sendResponse({
        text: selectedText,
        pageTitle: document.title,
        contextBefore: context.before,
        contextAfter: context.after
      });
    } else {
      sendResponse({ text: '' });
    }
    return true;
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
  const activeElement = document.activeElement;

  if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
    const range = selection.getRangeAt(0);
    const selectedText = selection.toString();
    const context = getSurroundingContext(selectedText);

    // Get bounding rect - use element rect for input/textarea for better positioning
    let rect;
    let selectionStart = null;
    let selectionEnd = null;
    let targetElement = null;

    if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
      // For input/textarea, use the element's bounding rect
      rect = activeElement.getBoundingClientRect();
      selectionStart = activeElement.selectionStart;
      selectionEnd = activeElement.selectionEnd;
      targetElement = activeElement;
    } else if (activeElement && activeElement.isContentEditable) {
      // For contenteditable, use range rect
      rect = range.getBoundingClientRect();
      targetElement = activeElement;
    } else {
      // For regular text selection
      rect = range.getBoundingClientRect();
    }

    // Validate rect - if invalid, use viewport center as fallback
    // Only use fallback if rect is truly invalid (not just positioned at 0,0)
    if (!rect || rect.width === 0 || rect.height === 0 ||
        (rect.left === 0 && rect.top === 0 && rect.right === 0 && rect.bottom === 0)) {
      console.warn('AI Text Assistant: Invalid selection rect, using fallback position');
      rect = {
        left: window.innerWidth / 2 - 150,
        top: window.innerHeight / 3,
        right: window.innerWidth / 2 + 150,
        bottom: window.innerHeight / 3 + 20,
        width: 300,
        height: 20
      };
    }

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
      timestamp: Date.now(),
      targetElement: targetElement, // Store reference to the element
      selectionStart: selectionStart, // For input/textarea
      selectionEnd: selectionEnd // For input/textarea
    };

    console.log('AI Text Assistant: Selection captured', {
      text: selectedText,
      pageTitle: document.title,
      contextBefore: context.before,
      contextAfter: context.after,
      elementType: targetElement ? targetElement.tagName : 'text',
      hasValidRect: rect.width > 0 && rect.height > 0
    });
  }
});

// Show loading popup
function showLoadingPopup() {
  console.log('AI Text Assistant: Showing loading popup');
  removeExistingPopup(true); // Immediate removal for loading state

  if (!selectionInfo) {
    console.error('AI Text Assistant: No selection info available');
    return;
  }

  lastSelection = selectionInfo;

  const popup = createPopup();
  popup.innerHTML = `
    <div class="ai-popup-content">
      <div class="ai-popup-loading">
        <div class="ai-spinner"><div class="ai-dot"></div></div>
        <span>Generating...</span>
      </div>
    </div>
  `;

  positionPopup(popup, selectionInfo.rect, selectionInfo.scrollX, selectionInfo.scrollY);
  document.body.appendChild(popup);
  currentPopup = popup;

  // Trigger fade-in animation
  requestAnimationFrame(() => {
    popup.classList.add('ai-popup-visible');
  });

  console.log('AI Text Assistant: Loading popup shown');
}

// Parse rewrite suggestions into array
function parseRewrites(result) {
  // Try to parse numbered list (1. ... 2. ... 3. ...)
  const lines = result.split('\n').filter(line => line.trim());
  const rewrites = [];

  // Pattern 1: "1. text" or "1) text"
  const numberedPattern = /^\s*(\d+)[\.\)]\s*(.+)$/;

  for (const line of lines) {
    const match = line.match(numberedPattern);
    if (match && match[2]) {
      rewrites.push(match[2].trim());
    }
  }

  // If we found numbered rewrites, return them
  if (rewrites.length >= 2) {
    return rewrites;
  }

  // Fallback: split by double newline or return as single option
  const paragraphs = result.split(/\n\n+/).filter(p => p.trim());
  if (paragraphs.length >= 2) {
    return paragraphs.map(p => p.trim());
  }

  // Last resort: return the whole result as one option
  return [result.trim()];
}

// Show result popup
function showResultPopup(result, originalText, command) {
  console.log('AI Text Assistant: Showing result popup');
  removeExistingPopup(true); // Immediate removal for new result

  if (!selectionInfo && !lastSelection) {
    console.error('AI Text Assistant: No selection info available for result');
    return;
  }

  const info = lastSelection || selectionInfo;

  const popup = createPopup();

  // Determine button text and behavior based on command
  const isExplain = command === 'explain';
  const isContinueWriting = command === 'continue-writing';
  const isSuggestRewrites = command === 'suggest-rewrites';
  const primaryButtonText = isExplain ? 'Dismiss' : 'Accept';

  // Special handling for suggest-rewrites
  if (isSuggestRewrites) {
    const rewrites = parseRewrites(result);

    let rewritesHTML = '<div class="ai-rewrite-options">';
    rewrites.forEach((rewrite, index) => {
      rewritesHTML += `<button class="ai-rewrite-option" data-index="${index}" data-rewrite="${escapeHtml(rewrite).replace(/"/g, '&quot;')}">${escapeHtml(rewrite)}</button>`;
    });
    rewritesHTML += '</div>';

    popup.innerHTML = `<div class="ai-popup-content"><div class="ai-popup-result ai-rewrite-mode"><div class="ai-rewrite-header">Choose a rewrite option:</div>${rewritesHTML}</div><div class="ai-popup-bottom"><div class="ai-popup-actions"><div class="ai-btn-group"><button class="ai-btn ai-btn-secondary ai-btn-copy" data-action="copy">Copy All</button><div class="ai-dropdown ai-dropdown-merged"><button class="ai-btn ai-btn-secondary ai-dropdown-toggle" data-action="dropdown"><span class="ai-dropdown-arrow">▼</span></button><div class="ai-dropdown-menu"><button class="ai-dropdown-item" data-action="regenerate">Regenerate</button><button class="ai-dropdown-item" data-action="reprompt">Add Instructions</button></div></div></div><button class="ai-btn ai-btn-secondary" data-action="cancel">Cancel</button></div><div class="ai-popup-footer">QuickAI</div></div></div>`;

    // Add click handlers for rewrite options
    popup.querySelectorAll('.ai-rewrite-option').forEach(button => {
      button.addEventListener('click', () => {
        const rewriteText = button.textContent;
        acceptText(rewriteText);
        removeExistingPopup();
      });
    });

    // Cancel button
    popup.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      removeExistingPopup();
    });

  } else {
    // Regular popup for other commands
    // Render markdown and LaTeX for explain command, otherwise use plain text
    const formattedResult = command === 'explain' ? renderFormattedText(result) : escapeHtml(result);

    popup.innerHTML = `
      <div class="ai-popup-content">
        <div class="ai-popup-result">${formattedResult}</div>
        <div class="ai-popup-bottom">
          <div class="ai-popup-actions">
            <button class="ai-btn ai-btn-primary" data-action="accept">${primaryButtonText}</button>
            <div class="ai-btn-group">
              <button class="ai-btn ai-btn-secondary ai-btn-copy" data-action="copy">Copy</button>
              <div class="ai-dropdown ai-dropdown-merged">
                <button class="ai-btn ai-btn-secondary ai-dropdown-toggle" data-action="dropdown">
                  <span class="ai-dropdown-arrow">▼</span>
                </button>
                <div class="ai-dropdown-menu">
                  <button class="ai-dropdown-item" data-action="regenerate">Regenerate</button>
                  <button class="ai-dropdown-item" data-action="reprompt">Add Instructions</button>
                  ${command === 'fix-spelling' ? '<button class="ai-dropdown-item" data-action="show-diff">Show Changes</button>' : ''}
                </div>
              </div>
            </div>
          </div>
          <div class="ai-popup-footer">QuickAI</div>
        </div>
      </div>
    `;

    // Add event listeners for regular commands
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

    // Copy button (default action)
    popup.querySelector('[data-action="copy"]').addEventListener('click', () => {
      copyToClipboard(result);
      removeExistingPopup();
    });
  }

  // Common event listeners for both paths
  const dropdownToggle = popup.querySelector('[data-action="dropdown"]');
  const dropdownContainer = popup.querySelector('.ai-dropdown');
  const dropdownMenu = popup.querySelector('.ai-dropdown-menu');

  dropdownToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownContainer.classList.toggle('ai-dropdown-menu-open');
  });

  // Dropdown items
  popup.querySelector('[data-action="regenerate"]').addEventListener('click', () => {
    dropdownContainer.classList.remove('ai-dropdown-menu-open');
    regenerateResponse(command, lastSelection || selectionInfo);
  });

  popup.querySelector('[data-action="reprompt"]').addEventListener('click', () => {
    dropdownContainer.classList.remove('ai-dropdown-menu-open');
    showRepromptDialog(command, lastSelection || selectionInfo, result);
  });

  // Copy All button for suggest-rewrites
  if (isSuggestRewrites) {
    popup.querySelector('[data-action="copy"]').addEventListener('click', () => {
      copyToClipboard(result);
      removeExistingPopup();
    });
  }

  // Add Show Changes button handler for fix-spelling command
  if (command === 'fix-spelling') {
    popup.querySelector('[data-action="show-diff"]').addEventListener('click', () => {
      dropdownContainer.classList.remove('ai-dropdown-menu-open');
      showDiffPopup(originalText, result, lastSelection || selectionInfo);
    });
  }

  // Close dropdown when clicking outside
  const closeDropdown = (e) => {
    if (!popup.contains(e.target)) {
      const dropdownContainer = popup.querySelector('.ai-dropdown');
      if (dropdownContainer) {
        dropdownContainer.classList.remove('ai-dropdown-menu-open');
      }
      document.removeEventListener('click', closeDropdown);
    }
  };

  // Use a slight delay to prevent immediate closing
  setTimeout(() => {
    document.addEventListener('click', closeDropdown);
  }, 0);

  positionPopup(popup, info.rect, info.scrollX, info.scrollY);
  document.body.appendChild(popup);
  currentPopup = popup;

  // Trigger fade-in animation
  requestAnimationFrame(() => {
    popup.classList.add('ai-popup-visible');
  });

  console.log('AI Text Assistant: Result popup shown');
}

// Show error popup
function showErrorPopup(error) {
  console.log('AI Text Assistant: Showing error popup:', error);
  removeExistingPopup(true); // Immediate removal for error state

  if (!selectionInfo && !lastSelection) {
    console.error('AI Text Assistant: No selection info available for error');
    // Show a fallback notification
    alert('AI Text Assistant Error: ' + error);
    return;
  }

  const info = lastSelection || selectionInfo;

  // Parse error message into structured format
  const errorHtml = formatErrorMessage(error);

  const popup = createPopup();
  popup.innerHTML = `<div class="ai-popup-content"><div class="ai-popup-error">${errorHtml}</div><div class="ai-popup-bottom"><div class="ai-popup-actions"><button class="ai-btn ai-btn-secondary" data-action="close">Close</button><button class="ai-btn ai-btn-primary" data-action="retry">Retry</button></div><div class="ai-popup-footer">QuickAI</div></div></div>`;

  // Add event listeners
  popup.querySelector('[data-action="close"]').addEventListener('click', () => {
    removeExistingPopup();
  });

  popup.querySelector('[data-action="retry"]').addEventListener('click', () => {
    removeExistingPopup();
    // Trigger command again if we have selection info
    if (lastSelection && lastSelection.text) {
      showLoadingPopup();
      // Send message to background to retry
      browser.runtime.sendMessage({
        type: 'regenerate-response',
        command: lastSelection.command || 'fix-spelling',
        selectedText: lastSelection.text,
        contextInfo: {
          pageTitle: lastSelection.pageTitle,
          contextBefore: lastSelection.contextBefore,
          contextAfter: lastSelection.contextAfter
        }
      }).catch(err => {
        console.error('AI Text Assistant: Error retrying:', err);
      });
    }
  });

  positionPopup(popup, info.rect, info.scrollX, info.scrollY);
  document.body.appendChild(popup);
  currentPopup = popup;

  // Trigger fade-in animation
  requestAnimationFrame(() => {
    popup.classList.add('ai-popup-visible');
  });

  // Auto-close after 10 seconds
  setTimeout(() => {
    if (currentPopup === popup) {
      removeExistingPopup();
    }
  }, 10000);

  console.log('AI Text Assistant: Error popup shown');
}

// Format error message with structure
function formatErrorMessage(error) {
  // Split by double newlines for paragraphs
  const parts = error.split('\n\n');
  let html = '';

  parts.forEach((part, index) => {
    const trimmed = part.trim();
    if (!trimmed) return;

    // Check if this part contains action items (starts with →)
    const lines = trimmed.split('\n');
    const hasActions = lines.some(line => line.trim().startsWith('→'));

    if (hasActions) {
      // This is an actions section
      html += '<div class="ai-error-actions">';
      lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('→')) {
          html += `<div class="ai-error-action-item">${escapeHtml(trimmedLine)}</div>`;
        } else if (trimmedLine) {
          html += `<div class="ai-error-text">${escapeHtml(trimmedLine)}</div>`;
        }
      });
      html += '</div>';
    } else {
      // Regular text paragraph
      if (index === 0) {
        // First paragraph is the title/header
        html += `<div class="ai-error-title">${escapeHtml(trimmed)}</div>`;
      } else {
        html += `<div class="ai-error-text">${escapeHtml(trimmed)}</div>`;
      }
    }
  });

  return html;
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
function removeExistingPopup(immediate = false) {
  if (currentPopup) {
    if (immediate) {
      // Immediate removal without animation
      currentPopup.remove();
      currentPopup = null;
    } else {
      // Add fade-out animation
      currentPopup.classList.add('ai-popup-hiding');
      currentPopup.classList.remove('ai-popup-visible');

      // Store reference and clear current
      const popupToRemove = currentPopup;
      currentPopup = null;

      // Remove after animation completes
      setTimeout(() => {
        popupToRemove.remove();
      }, 200); // Match the transition duration in CSS
    }
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
  const targetElement = lastSelection.targetElement;

  // Use stored target element if available, otherwise check current activeElement
  const elementToUse = targetElement || document.activeElement;

  if (elementToUse && (elementToUse.tagName === 'TEXTAREA' || elementToUse.tagName === 'INPUT')) {
    // For input/textarea elements
    try {
      // Refocus the element
      elementToUse.focus();

      // Use stored selection positions if available
      const start = lastSelection.selectionStart !== null ? lastSelection.selectionStart : elementToUse.selectionStart;
      const end = lastSelection.selectionEnd !== null ? lastSelection.selectionEnd : elementToUse.selectionEnd;
      const currentValue = elementToUse.value;
      const originalText = currentValue.substring(start, end);

      // Store undo state BEFORE making changes
      undoState = {
        element: elementToUse,
        type: 'replace',
        originalText: originalText,
        newText: text,
        start: start,
        end: end,
        fullValue: currentValue
      };

      // Replace the text
      elementToUse.value = currentValue.substring(0, start) + text + currentValue.substring(end);

      // Set cursor position after inserted text
      const newPosition = start + text.length;
      elementToUse.selectionStart = newPosition;
      elementToUse.selectionEnd = newPosition;

      // Trigger events
      elementToUse.dispatchEvent(new Event('input', { bubbles: true }));
      elementToUse.dispatchEvent(new Event('change', { bubbles: true }));

      console.log('AI Text Assistant: Text replaced in input/textarea');
      showUndoToast('Text replaced!');
    } catch (e) {
      console.error('AI Text Assistant: Error replacing text in input:', e);
      copyToClipboard(text);
      showTemporaryMessage('Text copied to clipboard');
    }
  } else if (elementToUse && elementToUse.isContentEditable) {
    // For contenteditable elements
    try {
      const originalText = lastSelection.text;

      // Store undo state BEFORE making changes
      undoState = {
        element: elementToUse,
        type: 'replace-contenteditable',
        originalText: originalText,
        newText: text,
        range: range.cloneRange()
      };

      elementToUse.focus();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, text);
      console.log('AI Text Assistant: Text replaced in contenteditable');
      showUndoToast('Text replaced!');
    } catch (e) {
      console.error('AI Text Assistant: Error replacing text in contenteditable:', e);
      copyToClipboard(text);
      showTemporaryMessage('Text copied to clipboard');
    }
  } else {
    // Fallback: try to select and replace
    try {
      const originalText = lastSelection.text;

      // Store undo state BEFORE making changes
      undoState = {
        element: null,
        type: 'replace-selection',
        originalText: originalText,
        newText: text,
        range: range.cloneRange()
      };

      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, text);
      console.log('AI Text Assistant: Text replaced in selection');
      showUndoToast('Text replaced!');
    } catch (e) {
      console.error('AI Text Assistant: Error replacing text:', e);
      // Last resort: copy to clipboard
      copyToClipboard(text);
      showTemporaryMessage('Text copied to clipboard');
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
  const targetElement = lastSelection.targetElement;

  // Use stored target element if available, otherwise check current activeElement
  const elementToUse = targetElement || document.activeElement;

  if (elementToUse && (elementToUse.tagName === 'TEXTAREA' || elementToUse.tagName === 'INPUT')) {
    // For input/textarea elements
    try {
      // Refocus the element
      elementToUse.focus();

      // Use stored selection end if available
      const end = lastSelection.selectionEnd !== null ? lastSelection.selectionEnd : elementToUse.selectionEnd;
      const currentValue = elementToUse.value;

      // Insert after the selection, with a space if needed
      const prefix = currentValue.substring(0, end);
      const suffix = currentValue.substring(end);
      const separator = prefix.endsWith(' ') ? '' : ' ';

      // Store undo state BEFORE making changes
      undoState = {
        element: elementToUse,
        type: 'insert',
        insertedText: separator + text,
        position: end,
        fullValue: currentValue
      };

      elementToUse.value = prefix + separator + text + suffix;

      // Set cursor position after inserted text
      const newPosition = end + separator.length + text.length;
      elementToUse.selectionStart = newPosition;
      elementToUse.selectionEnd = newPosition;

      // Trigger events
      elementToUse.dispatchEvent(new Event('input', { bubbles: true }));
      elementToUse.dispatchEvent(new Event('change', { bubbles: true }));

      console.log('AI Text Assistant: Text inserted after selection in input/textarea');
      showUndoToast('Text added!');
    } catch (e) {
      console.error('AI Text Assistant: Error inserting text in input:', e);
      copyToClipboard(text);
      showTemporaryMessage('Text copied to clipboard');
    }
  } else if (elementToUse && elementToUse.isContentEditable) {
    // For contenteditable elements
    try {
      // Store undo state BEFORE making changes
      undoState = {
        element: elementToUse,
        type: 'insert-contenteditable',
        insertedText: ' ' + text,
        range: range.cloneRange()
      };

      elementToUse.focus();
      selection.removeAllRanges();
      selection.addRange(range);
      selection.collapseToEnd();
      document.execCommand('insertText', false, ' ' + text);
      console.log('AI Text Assistant: Text inserted after selection in contenteditable');
      showUndoToast('Text added!');
    } catch (e) {
      console.error('AI Text Assistant: Error inserting text in contenteditable:', e);
      copyToClipboard(text);
      showTemporaryMessage('Text copied to clipboard');
    }
  } else {
    // Fallback: try to insert at end of selection
    try {
      // Store undo state BEFORE making changes
      undoState = {
        element: null,
        type: 'insert-selection',
        insertedText: ' ' + text,
        range: range.cloneRange()
      };

      selection.removeAllRanges();
      selection.addRange(range);
      selection.collapseToEnd();
      document.execCommand('insertText', false, ' ' + text);
      console.log('AI Text Assistant: Text inserted after selection');
      showUndoToast('Text added!');
    } catch (e) {
      console.error('AI Text Assistant: Error inserting text:', e);
      // Last resort: copy to clipboard
      copyToClipboard(text);
      showTemporaryMessage('Text copied to clipboard');
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

// Show toast with undo button
function showUndoToast(message) {
  // Remove existing toast
  if (currentToast) {
    currentToast.remove();
    currentToast = null;
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #22863a;
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    display: flex;
    align-items: center;
    gap: 12px;
    animation: slideIn 0.3s ease;
  `;

  const messageSpan = document.createElement('span');
  messageSpan.textContent = message;

  const undoButton = document.createElement('button');
  undoButton.textContent = 'Undo';
  undoButton.style.cssText = `
    background: rgba(255,255,255,0.2);
    border: 1px solid rgba(255,255,255,0.3);
    color: white;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease;
  `;

  undoButton.addEventListener('mouseenter', () => {
    undoButton.style.background = 'rgba(255,255,255,0.3)';
  });

  undoButton.addEventListener('mouseleave', () => {
    undoButton.style.background = 'rgba(255,255,255,0.2)';
  });

  undoButton.addEventListener('click', () => {
    performUndo();
    if (currentToast) {
      currentToast.remove();
      currentToast = null;
    }
  });

  toast.appendChild(messageSpan);
  toast.appendChild(undoButton);
  document.body.appendChild(toast);
  currentToast = toast;

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (currentToast === toast) {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        if (currentToast === toast) {
          toast.remove();
          currentToast = null;
          undoState = null; // Clear undo state
        }
      }, 300);
    }
  }, 5000);
}

// Perform undo operation
function performUndo() {
  if (!undoState) {
    console.error('AI Text Assistant: No undo state available');
    return;
  }

  console.log('AI Text Assistant: Performing undo, type:', undoState.type);

  try {
    if (undoState.type === 'replace') {
      // Undo replacement in input/textarea
      const element = undoState.element;
      if (element) {
        element.focus();
        const currentValue = element.value;
        const newTextLength = undoState.newText.length;

        // Remove the new text and restore original
        element.value = undoState.fullValue.substring(0, undoState.start) +
                       undoState.originalText +
                       undoState.fullValue.substring(undoState.end);

        // Restore selection
        element.selectionStart = undoState.start;
        element.selectionEnd = undoState.start + undoState.originalText.length;

        // Trigger events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        showTemporaryMessage('Undo successful!');
      }
    } else if (undoState.type === 'insert') {
      // Undo insertion in input/textarea
      const element = undoState.element;
      if (element) {
        element.focus();
        element.value = undoState.fullValue;

        // Restore cursor position
        element.selectionStart = undoState.position;
        element.selectionEnd = undoState.position;

        // Trigger events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        showTemporaryMessage('Undo successful!');
      }
    } else if (undoState.type === 'replace-contenteditable' || undoState.type === 'replace-selection') {
      // Undo replacement in contenteditable or regular text
      const element = undoState.element;
      const selection = window.getSelection();

      if (element) {
        element.focus();
      }

      // Try to find and replace the new text with original
      // This is a best-effort approach using document.execCommand
      const currentText = selection.toString();

      // Select all the new text (this is an approximation)
      if (undoState.range) {
        try {
          selection.removeAllRanges();
          const range = undoState.range.cloneRange();
          selection.addRange(range);

          // Delete the new text and insert original
          document.execCommand('delete', false);
          document.execCommand('insertText', false, undoState.originalText);

          showTemporaryMessage('Undo successful!');
        } catch (e) {
          console.error('AI Text Assistant: Error during undo:', e);
          copyToClipboard(undoState.originalText);
          showTemporaryMessage('Original text copied to clipboard');
        }
      }
    } else if (undoState.type === 'insert-contenteditable' || undoState.type === 'insert-selection') {
      // Undo insertion in contenteditable or regular text
      // This is harder as we need to remove the inserted text
      const element = undoState.element;
      const selection = window.getSelection();

      if (element) {
        element.focus();
      }

      // Best effort: use undo command if available
      try {
        document.execCommand('undo', false);
        showTemporaryMessage('Undo successful!');
      } catch (e) {
        console.error('AI Text Assistant: Error during undo:', e);
        showTemporaryMessage('Undo failed - try browser undo (Ctrl+Z)');
      }
    }

    undoState = null; // Clear undo state after use
  } catch (e) {
    console.error('AI Text Assistant: Error performing undo:', e);
    showTemporaryMessage('Undo failed');
  }
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

// Quick menu functionality
let quickMenu = null;
let quickMenuShortcut = { ctrl: true, shift: true, key: 'Space' };

// Load custom shortcut
async function loadQuickMenuShortcut() {
  try {
    const { quickMenuShortcut: customShortcut } = await browser.storage.sync.get('quickMenuShortcut');
    if (customShortcut) {
      quickMenuShortcut = customShortcut;
      console.log('AI Text Assistant: Loaded custom shortcut:', quickMenuShortcut);
    }
  } catch (error) {
    console.error('AI Text Assistant: Error loading shortcut:', error);
  }
}

// Load shortcut on page load
loadQuickMenuShortcut();

// Listen for shortcut changes
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.quickMenuShortcut) {
    quickMenuShortcut = changes.quickMenuShortcut.newValue;
    console.log('AI Text Assistant: Shortcut updated:', quickMenuShortcut);
  }
});

// Show quick command menu with keyboard shortcut
document.addEventListener('keydown', (e) => {
  // Check if the pressed keys match the configured shortcut
  const keyMatch = e.key === quickMenuShortcut.key ||
                   (quickMenuShortcut.key === 'Space' && e.code === 'Space');

  const modifiersMatch =
    (!!quickMenuShortcut.ctrl === e.ctrlKey) &&
    (!!quickMenuShortcut.alt === e.altKey) &&
    (!!quickMenuShortcut.shift === e.shiftKey) &&
    (!!quickMenuShortcut.meta === e.metaKey);

  if (keyMatch && modifiersMatch) {
    e.preventDefault();

    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      showQuickMenu();
    }
  }
});

function showQuickMenu() {
  // Remove existing quick menu if any
  removeQuickMenu();

  const selection = window.getSelection();
  if (!selection || !selection.toString().trim()) {
    return;
  }

  const selectedText = selection.toString();
  const range = selection.getRangeAt(0);
  const context = getSurroundingContext(selectedText);
  const activeElement = document.activeElement;

  // Get bounding rect - use element rect for input/textarea for better positioning
  let rect;
  let targetElement = null;
  let selectionStart = null;
  let selectionEnd = null;

  if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
    // For input/textarea, use the element's bounding rect
    rect = activeElement.getBoundingClientRect();
    targetElement = activeElement;
    selectionStart = activeElement.selectionStart;
    selectionEnd = activeElement.selectionEnd;
  } else if (activeElement && activeElement.isContentEditable) {
    // For contenteditable, use range rect
    rect = range.getBoundingClientRect();
    targetElement = activeElement;
  } else {
    // For regular text selection
    rect = range.getBoundingClientRect();
  }

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
    timestamp: Date.now(),
    targetElement: targetElement,
    selectionStart: selectionStart,
    selectionEnd: selectionEnd
  };

  // Create quick menu
  const menu = document.createElement('div');
  menu.className = 'ai-quick-menu';

  const commands = [
    { id: 'fix-spelling', icon: '✓', label: 'Improve Writing', description: 'Fix spelling & grammar' },
    { id: 'continue-writing', icon: '→', label: 'Continue Writing', description: 'Continue in same style' },
    { id: 'suggest-rewrites', icon: '⟳', label: 'Suggest Rewrites', description: 'Get alternatives' },
    { id: 'explain', icon: '?', label: 'Explain', description: 'Get explanation' }
  ];

  let menuHTML = '<div class="ai-quick-menu-header"><span class="ai-quick-menu-brand">QuickAI</span> | AI Commands</div>';
  menuHTML += '<div class="ai-quick-menu-items">';

  commands.forEach((cmd, index) => {
    menuHTML += `
      <div class="ai-quick-menu-item ${index === 0 ? 'ai-quick-menu-item-selected' : ''}" data-command="${cmd.id}" data-index="${index}">
        <span class="ai-quick-menu-icon">${cmd.icon}</span>
        <div class="ai-quick-menu-text">
          <div class="ai-quick-menu-label">${cmd.label}</div>
          <div class="ai-quick-menu-description">${cmd.description}</div>
        </div>
      </div>
    `;
  });

  menuHTML += '</div>';
  menuHTML += '<div class="ai-quick-menu-footer">↑↓ navigate • Enter select • Esc close</div>';
  menu.innerHTML = menuHTML;

  // Position menu near selection
  document.body.appendChild(menu);

  const menuRect = menu.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  let left = rect.left + scrollX;
  let top = rect.bottom + scrollY + 8;

  // Adjust if menu goes off screen
  if (left + menuRect.width > window.innerWidth) {
    left = window.innerWidth - menuRect.width - 8;
  }
  if (top + menuRect.height > window.innerHeight + scrollY) {
    top = rect.top + scrollY - menuRect.height - 8;
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  // Add fade-in animation
  requestAnimationFrame(() => {
    menu.classList.add('ai-quick-menu-visible');
  });

  quickMenu = menu;

  // Handle menu item clicks
  menu.querySelectorAll('.ai-quick-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const commandId = item.getAttribute('data-command');
      executeQuickCommand(commandId);
    });
  });

  // Handle keyboard navigation
  let selectedIndex = 0;
  const items = menu.querySelectorAll('.ai-quick-menu-item');

  const keyHandler = (e) => {
    if (!quickMenu) {
      document.removeEventListener('keydown', keyHandler);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[selectedIndex].classList.remove('ai-quick-menu-item-selected');
      selectedIndex = (selectedIndex + 1) % items.length;
      items[selectedIndex].classList.add('ai-quick-menu-item-selected');
      items[selectedIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[selectedIndex].classList.remove('ai-quick-menu-item-selected');
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      items[selectedIndex].classList.add('ai-quick-menu-item-selected');
      items[selectedIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const commandId = items[selectedIndex].getAttribute('data-command');
      executeQuickCommand(commandId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      removeQuickMenu();
    }
  };

  document.addEventListener('keydown', keyHandler);

  // Close menu when clicking outside
  const closeHandler = (e) => {
    if (quickMenu && !quickMenu.contains(e.target)) {
      removeQuickMenu();
      document.removeEventListener('click', closeHandler);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', closeHandler);
  }, 0);
}

function removeQuickMenu() {
  if (quickMenu) {
    quickMenu.classList.remove('ai-quick-menu-visible');
    quickMenu.classList.add('ai-quick-menu-hiding');
    setTimeout(() => {
      if (quickMenu) {
        quickMenu.remove();
        quickMenu = null;
      }
    }, 150);
  }
}

function executeQuickCommand(commandId) {
  removeQuickMenu();

  if (!selectionInfo) {
    console.error('AI Text Assistant: No selection info for quick command');
    return;
  }

  console.log('AI Text Assistant: Executing quick command:', commandId);

  // Show loading popup
  showLoadingPopup();

  // Send message to background script
  browser.runtime.sendMessage({
    type: 'regenerate-response',
    command: commandId,
    selectedText: selectionInfo.text,
    contextInfo: {
      pageTitle: selectionInfo.pageTitle,
      contextBefore: selectionInfo.contextBefore,
      contextAfter: selectionInfo.contextAfter
    }
  }).catch(error => {
    console.error('AI Text Assistant: Error executing quick command:', error);
    removeExistingPopup();
    showErrorPopup('Failed to execute command');
  });
}

// Regenerate response with same command
function regenerateResponse(command, selectionInfo) {
  if (!selectionInfo) {
    console.error('AI Text Assistant: No selection info for regeneration');
    return;
  }

  console.log('AI Text Assistant: Regenerating response for command:', command);
  
  // Show loading popup
  showLoadingPopup();
  
  // Send regeneration request to background script
  browser.runtime.sendMessage({
    type: 'regenerate-response',
    command: command,
    selectedText: selectionInfo.text,
    contextInfo: {
      pageTitle: selectionInfo.pageTitle,
      contextBefore: selectionInfo.contextBefore,
      contextAfter: selectionInfo.contextAfter
    }
  }).catch(error => {
    console.error('AI Text Assistant: Error sending regeneration request:', error);
    removeExistingPopup();
    showErrorPopup('Failed to regenerate response');
  });
}

// Show reprompt dialog for additional instructions
function showRepromptDialog(command, selectionInfo, currentResult) {
  if (!selectionInfo) {
    console.error('AI Text Assistant: No selection info for reprompt');
    return;
  }

  console.log('AI Text Assistant: Showing reprompt dialog for command:', command);

  if (!currentPopup) {
    console.error('AI Text Assistant: No current popup to modify');
    return;
  }

  // Replace the popup content with the reprompt input
  const popupContent = currentPopup.querySelector('.ai-popup-content');
  if (!popupContent) return;

  const formattedResult = command === 'explain' ? renderFormattedText(currentResult) : escapeHtml(currentResult);

  popupContent.innerHTML = `
    <div class="ai-popup-result">${formattedResult}</div>
    <div class="ai-reprompt-input-container">
      <input
        type="text"
        id="ai-reprompt-input"
        class="ai-reprompt-input"
        placeholder="e.g., Make it more formal, Fix grammar, Shorten..."
      />
    </div>
    <div class="ai-popup-bottom">
      <div class="ai-popup-actions">
        <button class="ai-btn ai-btn-secondary" data-action="cancel">Cancel</button>
        <button class="ai-btn ai-btn-primary" data-action="submit">Submit</button>
      </div>
      <div class="ai-popup-footer">QuickAI</div>
    </div>
  `;

  // Add event listeners
  popupContent.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    // Show the original result popup again
    showResultPopup(currentResult, selectionInfo.text, command);
  });

  const submitHandler = () => {
    const additionalInstructions = document.getElementById('ai-reprompt-input').value.trim();
    if (additionalInstructions) {
      showLoadingPopup();

      // Send reprompt request to background script
      browser.runtime.sendMessage({
        type: 'reprompt-response',
        command: command,
        selectedText: selectionInfo.text,
        additionalInstructions: additionalInstructions,
        currentResult: currentResult,
        contextInfo: {
          pageTitle: selectionInfo.pageTitle,
          contextBefore: selectionInfo.contextBefore,
          contextAfter: selectionInfo.contextAfter
        }
      }).catch(error => {
        console.error('AI Text Assistant: Error sending reprompt request:', error);
        removeExistingPopup();
        showErrorPopup('Failed to process additional instructions');
      });
    }
  };

  popupContent.querySelector('[data-action="submit"]').addEventListener('click', submitHandler);

  // Submit on Enter key
  const input = document.getElementById('ai-reprompt-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitHandler();
    }
  });

  // Focus on input
  setTimeout(() => {
    input.focus();
  }, 100);
}

// Show diff popup for spelling corrections
function showDiffPopup(originalText, correctedText, selectionInfo) {
  console.log('AI Text Assistant: Showing diff popup');
  removeExistingPopup(true); // Immediate removal for diff popup

  if (!selectionInfo) {
    console.error('AI Text Assistant: No selection info available for diff');
    return;
  }

  const popup = createPopup();
  
  // Generate diff HTML
  const diffHtml = generateDiffHtml(originalText, correctedText);

  popup.innerHTML = `
    <div class="ai-popup-content">
      <div class="ai-popup-diff-header">Changes Made:</div>
      <div class="ai-popup-diff">${diffHtml}</div>
      <div class="ai-popup-bottom">
        <div class="ai-popup-actions">
          <button class="ai-btn ai-btn-primary" data-action="accept">Accept Changes</button>
          <div class="ai-btn-group">
            <button class="ai-btn ai-btn-secondary ai-btn-copy" data-action="copy">Copy Corrected</button>
            <div class="ai-dropdown ai-dropdown-merged">
              <button class="ai-btn ai-btn-secondary ai-dropdown-toggle" data-action="dropdown">
                <span class="ai-dropdown-arrow">▼</span>
              </button>
              <div class="ai-dropdown-menu">
                <button class="ai-dropdown-item" data-action="back">Back to Result</button>
              </div>
            </div>
          </div>
        </div>
        <div class="ai-popup-footer">QuickAI</div>
      </div>
    </div>
  `;

  // Add event listeners
  popup.querySelector('[data-action="accept"]').addEventListener('click', () => {
    acceptText(correctedText);
    removeExistingPopup();
  });

  popup.querySelector('[data-action="copy"]').addEventListener('click', () => {
    copyToClipboard(correctedText);
    removeExistingPopup();
  });

  // Dropdown toggle
  const dropdownToggle = popup.querySelector('[data-action="dropdown"]');
  const dropdownContainer = popup.querySelector('.ai-dropdown');
  const dropdownMenu = popup.querySelector('.ai-dropdown-menu');

  dropdownToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownContainer.classList.toggle('ai-dropdown-menu-open');
  });

  // Back to result button
  popup.querySelector('[data-action="back"]').addEventListener('click', () => {
    dropdownContainer.classList.remove('ai-dropdown-menu-open');
    showResultPopup(correctedText, originalText, 'fix-spelling');
  });

  // Close dropdown when clicking outside
  const closeDropdown = (e) => {
    if (!popup.contains(e.target)) {
      dropdownContainer.classList.remove('ai-dropdown-menu-open');
      document.removeEventListener('click', closeDropdown);
    }
  };

  // Use a slight delay to prevent immediate closing
  setTimeout(() => {
    document.addEventListener('click', closeDropdown);
  }, 0);

  positionPopup(popup, selectionInfo.rect, selectionInfo.scrollX, selectionInfo.scrollY);
  document.body.appendChild(popup);
  currentPopup = popup;

  // Trigger fade-in animation
  requestAnimationFrame(() => {
    popup.classList.add('ai-popup-visible');
  });

  console.log('AI Text Assistant: Diff popup shown');
}

// Generate diff HTML showing changes between original and corrected text
function generateDiffHtml(originalText, correctedText) {
  // Split into words while preserving punctuation
  const tokenize = (text) => {
    // Split on spaces but keep punctuation with words
    return text.match(/\S+/g) || [];
  };

  const originalWords = tokenize(originalText);
  const correctedWords = tokenize(correctedText);

  // Simple LCS-based diff
  const lcs = computeLCS(originalWords, correctedWords);

  let diffHtml = '';
  let i = 0, j = 0;
  let changeCount = 0;

  while (i < originalWords.length || j < correctedWords.length) {
    if (i < originalWords.length && j < correctedWords.length &&
        originalWords[i] === correctedWords[j] && lcs[i] && lcs[i][j]) {
      // Words match
      diffHtml += escapeHtml(originalWords[i]) + ' ';
      i++;
      j++;
    } else {
      // There's a difference
      changeCount++;

      // Check if it's a deletion
      if (i < originalWords.length && (!lcs[i] || !lcs[i][j])) {
        diffHtml += `<span class="ai-diff-removed" data-change="${changeCount}">${escapeHtml(originalWords[i])}</span> `;
        i++;
      }

      // Check if it's an addition
      if (j < correctedWords.length && (!lcs[i] || !lcs[i][j])) {
        diffHtml += `<span class="ai-diff-added" data-change="${changeCount}">${escapeHtml(correctedWords[j])}</span> `;
        j++;
      }
    }
  }

  return diffHtml.trim();
}

// Compute Longest Common Subsequence for better diff
function computeLCS(arr1, arr2) {
  const m = arr1.length;
  const n = arr2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  // Build LCS length table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to mark LCS positions
  const lcs = Array(m).fill(null).map(() => Array(n).fill(false));
  let i = m, j = n;

  while (i > 0 && j > 0) {
    if (arr1[i - 1] === arr2[j - 1]) {
      lcs[i - 1][j - 1] = true;
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

console.log('AI Text Assistant: Content script initialized');
