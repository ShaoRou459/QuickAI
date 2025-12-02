# CRUSH.md - QuickAI Firefox Extension

## Project Overview

QuickAI is a Firefox browser extension that provides lightning-fast AI text assistance with smart context awareness. It's a pure JavaScript extension (no frameworks) that supports multiple AI providers (OpenAI, Anthropic Claude, Google Gemini, and custom endpoints) and offers text improvement, continuation, rewriting, and explanation capabilities.

**Extension ID**: Manifest V2 Firefox extension
**Permissions**: contextMenus, activeTab, tabs, storage, <all_urls>
**Storage**: Local browser storage (sync) for settings and history

## Development Commands

### Loading the Extension
```bash
# No build process required - extension is ready to load directly
# 1. Open Firefox and navigate to about:debugging
# 2. Click "This Firefox" in left sidebar
# 3. Click "Load Temporary Add-on"
# 4. Select manifest.json from the project root
```

### Testing
```bash
# Open test-playground.html in browser for UI testing
# No automated test suite - manual testing only
```

### Build/Distribution
```bash
# No build system - files are used as-is
# Create zip manually if needed:
# zip -r QuickAI.zip . -x "*.git*" "*.DS_Store*" "test-playground.html"
```

## Code Architecture & File Structure

### Core Files
- **manifest.json**: Extension configuration and permissions
- **background.js**: Background script handling context menus, API calls, and storage
- **content.js**: Content script for popup management and DOM interaction
- **content.css**: Minimalistic Notion-like styling for AI result popups
- **popup.html/popup.js**: Extension toolbar popup for quick settings
- **options.html/options.js/options.css**: Full settings page

### Third-party Dependencies
- **marked.min.js**: Markdown parsing library
- **katex.min.js**: LaTeX math rendering library
- **katex.min.css**: KaTeX styling
- **fonts/**: KaTeX font files (required for math rendering)

### Key Architecture Patterns
- **Message Passing**: Uses `browser.runtime.onMessage` for background ↔ content communication
- **Storage API**: `browser.storage.sync` for settings persistence
- **Context Menus**: Dynamic context menu registration in background script
- **Selection Management**: Robust text selection handling with undo/redo support

## AI Provider System

### Supported Providers
- **OpenAI**: GPT-3.5 Turbo, GPT-4, GPT-4 Turbo, GPT-4o, GPT-4o Mini
- **Anthropic Claude**: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku
- **Google Gemini**: Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini Pro
- **Custom**: Any OpenAI-compatible endpoint

### Provider Configuration Structure
Each provider in `AI_PROVIDERS` object contains:
```javascript
{
  name: 'Display Name',
  defaultBaseUrl: 'https://api.example.com/v1',
  defaultModel: 'model-name',
  authHeader: 'Bearer', // or 'x-api-key' for some providers
  formatRequest: (model, messages, temperature, maxTokens) => ({/* request body */}),
  extractResponse: (data) => data.response.path
}
```

### API Request Flow
1. User triggers command via context menu or keyboard shortcut
2. Background script receives command with selection info
3. Provider-specific formatting applied
4. API call made with proper headers
5. Response parsed using provider's `extractResponse`
6. Result sent to content script for display

## User Interface System

### Popup Display System
- **Loading State**: Shows "AI is thinking..." with animation
- **Result Popup**: Displays formatted response with action buttons
- **Error Popup**: Shows error messages with retry option
- **Toast Notifications**: Brief status messages

### Action Buttons
- **Accept**: Replace selected text with AI result
- **Copy**: Copy result to clipboard
- **Cancel**: Dismiss popup
- **Rewrite Options**: Numbered buttons for multiple suggestions

### Theme System
- **Light/Dark Modes**: Toggle via settings
- **Color Palette**: Primary colors (#37352f, #f7f6f3)
- **Notion-inspired Design**: Clean, minimalistic interface
- **Responsive Design**: Adapts to content and viewport

## Key Features Implementation

### Context Awareness
- **Page Title**: Included in AI context when enabled
- **Surrounding Text**: ±200 characters around selection
- **DOM Element**: Input field type and form context
- **Debug Mode**: Full prompt logging for troubleshooting

### Keyboard Shortcuts
- **Default**: Ctrl+Shift+Space (Windows/Linux), Cmd+Shift+Space (Mac)
- **Customizable**: Users can record custom shortcuts
- **Quick Menu**: Arrow key navigation with Enter/Esc

### History System
- **Storage**: Last 100 AI interactions
- **Searchable**: Full-text search across history
- **Metadata**: Timestamp, command, provider, model
- **Disable Option**: Privacy-focused - can be turned off

## Security & Privacy

### API Key Management
- **Local Storage Only**: API keys stored in browser storage
- **No Third-party Sharing**: Keys never sent to external services
- **Provider-specific Headers**: Each provider uses appropriate auth format

### Permissions Model
- **Minimal Required**: Only requests necessary permissions
- **Content Script Injection**: Runs on all URLs via manifest
- **No Background Fetching**: All API calls triggered by user action

## Code Conventions & Patterns

### JavaScript Patterns
- **Pure Vanilla JS**: No frameworks or libraries except marked.js and KaTeX
- **ES6+ Features**: Uses modern JavaScript (async/await, arrow functions, destructuring)
- **Browser APIs**: Uses Firefox WebExtensions API (browser.*)
- **Error Handling**: Comprehensive try-catch blocks with user feedback

### Naming Conventions
- **Files**: kebab-case (content.js, background.js)
- **Variables**: camelCase (currentPopup, selectionInfo)
- **Constants**: UPPER_SNAKE_CASE (AI_COMMANDS, AI_PROVIDERS)
- **CSS Classes**: kebab-case with prefixes (ai-assistant-popup, ai-popup-content)

### DOM Manipulation
- **Element Creation**: Uses `document.createElement` and set properties
- **Event Handling**: Proper event listener management with cleanup
- **CSS Classes**: Toggle-based approach for animations and themes
- **Selection Preservation**: Maintains text selection across operations

### Storage Patterns
- **Structured Data**: Objects with clear key naming
- **Default Values**: Fallback values for missing settings
- **Migration Handling**: Graceful handling of setting structure changes
- **Sync Storage**: Uses browser.storage.sync for cross-device sync

## Testing & Debugging

### Manual Testing
- **test-playground.html**: HTML page for testing UI components
- **Firefox Developer Tools**: Extension debugging via about:debugging
- **Console Logging**: Comprehensive logging throughout codebase

### Debug Mode
- **Setting Toggle**: Enable in Advanced settings
- **Full Prompt Logging**: Shows complete API requests in console
- **Error Details**: Detailed error messages with stack traces

### Common Testing Scenarios
- **Different Input Types**: Text inputs, textareas, contenteditable
- **Edge Cases**: Empty selections, very long text, special characters
- **Provider Switching**: Test different AI providers and models
- **Network Issues**: Offline mode, API failures, timeouts

## Important Gotchas & Non-obvious Patterns

### Firefox Extension Specifics
- **Manifest V2**: Currently using V2 (not V3)
- **browser.* APIs**: Uses Firefox-specific APIs (not chrome.*)
- **Content Script Injection**: Runs at document_idle
- **Persistent Background**: Background script is persistent (true)

### Selection Handling
- **Range Preservation**: Complex logic to maintain text selection across DOM changes
- **Undo System**: Implements custom undo/redo for text replacement
- **Focus Management**: Properly handles input focus after text replacement

### API Provider Differences
- **Message Formats**: Each provider has different API message structure
- **Auth Headers**: Some use 'Bearer', others use different header names
- **Response Parsing**: Provider-specific response extraction logic
- **Error Handling**: Different error response formats per provider

### Performance Considerations
- **Debouncing**: Keyboard shortcuts and rapid selections
- **Memory Management**: Cleanup of popup elements and event listeners
- **Large Text Handling**: Limits and chunking for very long selections

## Configuration Files

### Key Settings Structure
```javascript
{
  provider: 'openai',           // AI provider
  baseUrl: 'https://...',       // API endpoint
  apiKey: 'sk-...',            // User's API key
  model: 'gpt-4o',             // Selected model
  theme: 'light',              // light/dark theme
  saveHistory: true,           // History logging toggle
  showContextMenu: true,       // Context menu visibility
  shortcut: 'Ctrl+Shift+Space', // Keyboard shortcut
  includePageTitle: true,      // Context settings
  includeSurroundingText: true,
  debugMode: false,            // Debug mode
  customPrompts: {             // Custom AI prompts
    'fix-spelling': '...',
    'continue-writing': '...',
    // etc.
  }
}
```

### Message Types
- **ai-loading**: Show loading popup
- **ai-result**: Display AI response
- **ai-error**: Show error message
- **get-context**: Request page context
- **theme-changed**: Update theme across scripts

## Common Tasks

### Adding New AI Provider
1. Add provider config to `AI_PROVIDERS` in background.js
2. Add to `PROVIDER_CONFIG` in options.js and popup.js
3. Update UI provider selection if needed
4. Test API integration thoroughly

### Modifying Commands
1. Update `AI_COMMANDS` array in background.js
2. Add prompt templates to default prompts
3. Update context menu registration
4. Test with different content types

### UI Style Changes
1. Modify content.css for popup styles
2. Update options.css for settings page
3. Test both light and dark themes
4. Verify responsive behavior

### Storage Schema Changes
1. Plan migration for existing users
2. Update default values in options.js
3. Handle missing keys gracefully
4. Test with fresh installations and upgrades

## External Dependencies

### CDN Libraries (included locally)
- **marked.js**: v4.0+ - Markdown parsing
- **KaTeX**: v0.16+ - LaTeX math rendering
- **KaTeX Fonts**: Required for math display

### Firefox APIs
- **browser.runtime**: Extension messaging
- **browser.storage**: Data persistence
- **browser.contextMenus**: Context menu creation
- **browser.tabs**: Tab management
- **browser.commands**: Keyboard shortcuts

## Version Management

### Current Version: 1.0.0
- **Manifest Version**: 2 (Firefox)
- **Compatibility**: Firefox 88+
- **No Build Process**: Direct file loading

### Release Process
1. Update version in manifest.json
2. Test thoroughly with multiple providers
3. Create zip archive for distribution
4. Update documentation as needed