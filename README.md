# OpenCode Chrome Annotation

Companion Chrome extension for the [`opencode-chrome-annotation`](https://www.npmjs.com/package/opencode-chrome-annotation) OpenCode plugin. Annotate any page in Chrome and send the screenshot, selected element metadata, and your instruction straight into your local [OpenCode](https://opencode.ai) session.

The plugin side (the OpenCode plugin, local HTTP server, and screenshot handling) lives in the main repo: https://github.com/jodusnodus/opencode-chrome-annotation

## Install

Add the plugin to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-chrome-annotation@latest"]
}
```

Install the Chrome extension from the Chrome Web Store:

https://chromewebstore.google.com/detail/abeihanpaeioklkhioiigklonbomhjfd

## How It Works

1. Start OpenCode in your project.
2. Click the extension button in Chrome.
3. Connect the current tab to your OpenCode session from the in-page picker.
4. Click **Annotate** in the in-page pill.
5. Select an element, write your instruction, and submit. Queue several annotations, then send them all at once.

### What Gets Sent

- Your written instruction.
- The current page URL and title.
- Selected element metadata such as selector, tag, text, role, aria label, and bounds.
- A cropped screenshot of the selected element.

The plugin runs a local HTTP server bound to `127.0.0.1` on ports `39240-39260`. The extension discovers active OpenCode instances over localhost and routes annotations to the session the tab is connected to. OpenCode and your Chromium browser need to be on the same localhost (not in separate containers).

This repo contains the extension source only (`manifest.json`, `background.js`, `injected/dom.js`, `icons/`). The plugin source and build scripts live in the main repo.

## Development

The extension in this repo is the output of the main repo's `bun run build:extension` (`extension-src/` compiles into this directory).

To load it:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked** and select this directory.

To edit, work in `extension-src/` in the main repo, rebuild, and reload the extension. From the main repo:

```bash
bun run build:extension   # rebuild this directory
bun run build:zip         # zip for Chrome Web Store upload
bun run icons:generate    # regenerate icons from icon.svg
```
