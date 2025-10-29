# ⚡ QuickAI - Firefox Extension

<div align="center">

![QuickAI Logo](icon.png)

**Lightning-fast AI text assistant with smart context awareness**

[![Firefox Extension Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/yourusername/quickai)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Firefox](https://img.shields.io/badge/firefox-88%2B-orange.svg)](https://www.mozilla.org/firefox/new/)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI%20Compatible-00AA00.svg)](https://openai.com/api/)

Fix spelling, continue writing, get rewrites, and explain text instantly - all with a minimalistic, Notion-like design.

[Install Guide](#installation) • [Features](#features) • [Usage](#usage) • [Configuration](#configuration)

</div>

## ✨ Features

- **🔧 Improve Writing**: Correct spelling and grammar errors in selected text
- **✍️ Continue Writing**: Let AI continue your text in the same style and tone
- **🔄 Suggest Rewrites**: Get multiple alternative ways to rewrite your text
- **❓ Explain**: Get clear explanations with markdown and LaTeX math support
- **⌨️ Keyboard Shortcut**: Customizable quick menu shortcut (default: Ctrl+Shift+Space)
- **🧠 Smart Context**: Uses page title and surrounding text (±200 chars) for better understanding
- **📝 History Logging**: Track your last 100 AI interactions (can be disabled)
- **🎨 Custom Prompts**: Fully customizable AI prompts for each command
- **🌓 Dark Mode**: Beautiful dark theme support
- **🔒 Privacy-Focused**: API key stored locally, no third-party data sharing

## 🚀 Installation

### Loading the Extension in Firefox

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on"
4. Navigate to the extension directory and select the `manifest.json` file
5. The extension is now loaded and ready to use

## ⚙️ Configuration

1. Click the QuickAI icon in the toolbar or right-click any selected text and go to AI Assistant menu
2. Click "Open Settings" (or navigate to the extension settings)
3. Configure your API settings:
   - **Base URL**: OpenAI API endpoint (default: `https://api.openai.com/v1`)
   - **API Key**: Your OpenAI API key (required)
   - **Model**: Choose from available models (GPT-3.5 Turbo, GPT-4, etc.)
4. Click "Test Connection" to verify your settings
5. Click "Save Settings"

## 📖 Usage

### Method 1: Right-Click Menu
1. Select any text on a webpage
2. Right-click to open the context menu
3. Navigate to "QuickAI" and choose a command:
   - Improve Writing
   - Continue Writing
   - Suggest Rewrites
   - Explain
4. Wait for the AI to process your request
5. A popup will appear below the selected text with the result
6. Choose an action:
   - **Accept**: Replace the selected text with the AI result
   - **Copy**: Copy the result to your clipboard
   - **Cancel**: Dismiss the popup

### Method 2: Keyboard Shortcut (Quick Menu)
1. Select any text on a webpage
2. Press **Ctrl+Shift+Space** (or **Cmd+Shift+Space** on Mac)
3. A quick command menu will appear with all available commands
4. Navigate with **↑/↓** arrow keys or click to select
5. Press **Enter** to execute or **Esc** to close

## 🔧 Advanced Settings

Navigate to the **Advanced** tab in settings to customize:

### General Settings
- **Save Command History**: Toggle whether to save your AI interactions (enabled by default)
- **Show in Context Menu**: Toggle the right-click context menu on/off
- **Quick Menu Shortcut**: Click to record a custom keyboard shortcut (default: Ctrl+Shift+Space)

### Context Settings
- **Include Page Title**: Add page title to AI context for better understanding
- **Include Surrounding Text**: Include ±200 characters around selection for context
- **Debug Mode**: Log full prompts to console for troubleshooting

### Custom Prompts
- Customize the AI prompt for each command
- Use `{text}` as placeholder for selected text
- Reset to defaults at any time

## 🌐 Compatibility

- Works with OpenAI API and any OpenAI-compatible endpoints
- Supports input fields, textareas, and contenteditable elements
- Minimal permissions required
- Compatible with Firefox 88+

## 🎨 Design

The extension features a minimalistic, Notion-inspired design with:
- Clean, modern interface
- Subtle animations and transitions
- Carefully chosen color palette (#37352f, #f7f6f3)
- Responsive and unobtrusive popups

## 🔒 Privacy

- API key is stored locally in your browser
- No data is sent to third parties except your configured API endpoint
- All processing happens through your own API key
- Optional history logging can be disabled

## 🛠️ Development

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
├── popup.js              # Extension popup logic
├── icon.png              # Extension icon
├── icon.svg              # Extension icon (vector)
├── marked.min.js         # Markdown parser
├── katex.min.js          # LaTeX math renderer
├── katex.min.css         # KaTeX styles
└── fonts/                # KaTeX font files
```

### Technologies

- **Pure JavaScript** (no frameworks)
- **Firefox WebExtensions API**
- **OpenAI API format**
- **KaTeX** for LaTeX math rendering
- **Marked.js** for markdown parsing

### Building from Source

1. Clone this repository
2. No build process required - the extension is ready to load
3. Follow the installation instructions above

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [OpenAI](https://openai.com/) for the powerful API
- [KaTeX](https://katex.org/) for beautiful math rendering
- [Marked.js](https://marked.js.org/) for markdown parsing
- Firefox extension documentation and community

---

<div align="center">

**Made with ❤️ for the Firefox community**

[Report Issues](https://github.com/yourusername/quickai/issues) • [Request Features](https://github.com/yourusername/quickai/issues/new)

</div>