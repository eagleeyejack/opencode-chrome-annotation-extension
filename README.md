# OpenCode Chrome Annotation

Companion Chrome extension for the [`opencode-chrome-annotation`](https://www.npmjs.com/package/opencode-chrome-annotation) OpenCode plugin. Annotate any page in Chrome and send the screenshot, selected element metadata, and your instruction straight into your local [OpenCode](https://opencode.ai) session.

> Note: this project is not built by the OpenCode team and is not affiliated with them in any way. It is a GPL-3.0 fork of [JodusNodus/opencode-chrome-annotation](https://github.com/JodusNodus/opencode-chrome-annotation) with the extension UI rebuilt as a Chrome side panel.

The plugin side (the OpenCode plugin, local HTTP server, and screenshot handling) lives in the main repo: https://github.com/JodusNodus/opencode-chrome-annotation

## Install

Add the plugin to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-chrome-annotation@latest"]
}
```

Install the extension from this repo (your own Chrome Web Store listing can be added later):

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked** and select this directory.

## How It Works

1. Start OpenCode in your project.
2. Click the extension icon. Chrome opens the OpenCode **side panel** docked beside the page, so the UI never covers the site you are annotating.
3. Pick your OpenCode session from the panel list to connect the current tab.
4. Click **Select element on page**, click any element, write your instruction, and add it to the queue.
5. Queue several annotations, then send them all at once with **Send all to OpenCode**.

The side panel is used on desktop Chrome 114+. On browsers without the Side Panel API (for example Chrome for Android), the extension falls back to the earlier in-page picker and floating pill.

### What Gets Sent

- Your written instruction.
- The current page URL and title.
- Selected element metadata such as selector, tag, text, role, aria label, and bounds.
- A cropped screenshot of the selected element.

The plugin runs a local HTTP server bound to `127.0.0.1` on ports `39240-39260`. The extension discovers active OpenCode instances over localhost and routes annotations to the session the tab is connected to. OpenCode and your Chromium browser need to be on the same localhost (not in separate containers).

## Files

- `manifest.json` - MV3 manifest, side panel registration, permissions.
- `background.js` - service worker: session discovery, tab claims, queue store, selection sessions, messaging to the side panel and content scripts.
- `sidepanel.html` / `sidepanel.js` - the side panel UI: session picker, annotate form, and annotation queue.
- `injected/selection.js` - lightweight in-page element highlighting and selection while annotating.
- `injected/dom.js` - in-page helpers (dockable pill, picker, screenshot cropping) used by the fallback UI.

## Development

This fork develops the extension directly in this repo (the upstream plugin repo's `extension-src/` build no longer matches this fork's newer extension features).

To load it:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked** and select this directory.

After editing any file, click the reload icon on the extension card, then reload the tabs you are annotating.
