<div align="center">
  <img src="./QuickAI-Chrome/icon.svg" alt="QuickAI Icon" width="120" height="120">

  # QuickAI ⚡️

  **The lightning-fast, privacy-first AI assistant for your browser.**

  [![Chrome](https://img.shields.io/badge/Chrome-Supported-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://www.google.com/chrome/)
  [![Firefox](https://img.shields.io/badge/Firefox-Supported-FF7139?style=for-the-badge&logo=firefox-browser&logoColor=white)](https://www.mozilla.org/en-US/firefox/new/)
  [![Version](https://img.shields.io/badge/Version-1.0.0-blue?style=for-the-badge)](https://github.com/)
  [![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](https://opensource.org/licenses/MIT)
  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-success?style=for-the-badge&logo=google-chrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)

</div>

QuickAI brings the power of **OpenAI**, **Anthropic (Claude)**, and **Google (Gemini)** directly into your web browsing flow. It's designed to be lightweight, customizable, and secure—your API keys never leave your browser.

## ✨ Key Features

*   **🧠 Smart Context Awareness**: Unlike generic chatbots, QuickAI sees what you see. It uses the page title and surrounding text to provide relevant, accurate answers.
*   **🔐 Privacy First (BYOK)**: "Bring Your Own Key." Your API keys are stored locally in your browser's sync storage. No tracking, no middleman servers.
*   **⚡️ Lightning Fast**: Built with vanilla JavaScript and optimized for performance (Manifest V3). No heavy frameworks.
*   **🎨 Native Feel**: A clean, Notion-inspired UI that blends into any website. Supports **Dark Mode** 🌙.
*   **🤖 Multi-Provider Support**:
    *   **OpenAI** (GPT-4o, GPT-4 Turbo, GPT-3.5)
    *   **Anthropic** (Claude 3.5 Sonnet, Opus, Haiku)
    *   **Google** (Gemini 1.5 Pro, Flash)
    *   **Custom** (Any OpenAI-compatible endpoint, e.g., Local LLMs via Ollama)
*   **⌨️ Command Palette**: Power user? Select text and hit `Ctrl+Shift+Space` (or `Cmd+Shift+Space` on Mac) to open the keyboard-driven command interface.

## 📥 Installation

### Chrome (and Chromium browsers)
1.  Download/Clone this repository.
2.  Open `chrome://extensions`.
3.  Enable **Developer mode** (top right toggle).
4.  Click **Load unpacked**.
5.  Select the `QuickAI-Chrome` folder.

### Firefox
1.  Download/Clone this repository.
2.  Open `about:debugging`.
3.  Click **This Firefox** (sidebar).
4.  Click **Load Temporary Add-on**.
5.  Select any file inside the `QuickAI-Firefox` folder (e.g., `manifest.json`).

## ⚙️ Configuration

1.  Click the **QuickAI icon** in your browser toolbar.
2.  Click the **Settings (gear)** icon.
3.  Select your preferred **AI Provider**.
4.  Paste your **API Key**.
5.  (Optional) Customize prompts, models, and shortcuts.

## 🚀 Usage

### Method 1: Context Menu (Mouse)
1.  Select any text on a webpage.
2.  **Right-click** the selection.
3.  Hover over **QuickAI** and choose a command:
    *   *Improve Writing*
    *   *Fix Spelling*
    *   *Explain*
    *   *Summarize*

### Method 2: Command Palette (Keyboard)
1.  Select text.
2.  Press `Ctrl+Shift+Space` (Windows/Linux) or `Cmd+Shift+Space` (macOS).
3.  Use the arrow keys to select a command or type a custom prompt.
4.  Press **Enter**.

## 🛠️ Development

The project is structured for cross-browser compatibility:

*   `QuickAI-Chrome/`: Source code for Chrome (Manifest V3 Service Worker).
*   `QuickAI-Firefox/`: Source code for Firefox (Manifest V3 Event Page).

Both versions share core logic but use different API namespaces (`chrome.*` vs `browser.*`).

---

*Note: This project is not affiliated with OpenAI, Anthropic, or Google.*
