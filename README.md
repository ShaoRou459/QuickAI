# ⚡ QuickAI - Firefox Extension

Lightning-fast AI text assistant with smart context awareness. Fix spelling, continue writing, get rewrites, and explain text instantly - all with a minimalistic, Notion-like design.

## Features

- **Fix Spelling**: Correct spelling and grammar errors in selected text
- **Continue Writing**: Let AI continue your text in the same style and tone
- **Suggest Rewrites**: Get multiple alternative ways to rewrite your text
- **Explain**: Get clear explanations with markdown and LaTeX math support
- **Smart Context**: Uses page title and surrounding text (±200 chars) for better understanding
- **History Logging**: Track your last 100 AI interactions
- **Custom Prompts**: Fully customizable AI prompts for each command
- **Debug Mode**: View full prompts in console for development
- **Dark Mode**: Beautiful dark theme support

## Installation

### Loading the Extension in Firefox

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on"
4. Navigate to the extension directory and select the `manifest.json` file
5. The extension is now loaded and ready to use

### Configuration

1. Click the QuickAI icon in the toolbar or right-click any selected text and go to AI Assistant menu
2. Click "Open Settings" (or navigate to the extension settings)
3. Configure your API settings:
   - **Base URL**: OpenAI API endpoint (default: `https://api.openai.com/v1`)
   - **API Key**: Your OpenAI API key (required)
   - **Model**: Choose from available models (GPT-3.5 Turbo, GPT-4, etc.)
4. Click "Test Connection" to verify your settings
5. Click "Save Settings"

## Usage

1. Select any text on a webpage
2. Right-click to open the context menu
3. Navigate to "AI Assistant" and choose a command:
   - Fix Spelling
   - Continue Writing
   - Suggest Rewrites
4. Wait for the AI to process your request
5. A popup will appear below the selected text with the result
6. Choose an action:
   - **Accept**: Replace the selected text with the AI result
   - **Copy**: Copy the result to your clipboard
   - **Cancel**: Dismiss the popup

## Compatibility

- Works with OpenAI API and any OpenAI-compatible endpoints
- Supports input fields, textareas, and contenteditable elements
- Minimal permissions required

## Design

The extension features a minimalistic, Notion-inspired design with:
- Clean, modern interface
- Subtle animations and transitions
- Carefully chosen color palette (#37352f, #f7f6f3)
- Responsive and unobtrusive popups

## Privacy

- API key is stored locally in your browser
- No data is sent to third parties except your configured API endpoint
- All processing happens through your own API key

## Development

### Project Structure

```
aiextension/
├── manifest.json          # Extension manifest
├── background.js          # Background script (API calls, context menu)
├── content.js            # Content script (popup management)
├── content.css           # Popup styling
├── options.html          # Settings page HTML
├── options.css           # Settings page styling
├── options.js            # Settings page logic
├── popup.html            # Extension popup HTML
├── icon.png              # Extension icon
└── README.md             # This file
```

### Technologies

- Pure JavaScript (no frameworks)
- Firefox WebExtensions API
- OpenAI API format

## License

MIT License - Feel free to modify and distribute as needed.
