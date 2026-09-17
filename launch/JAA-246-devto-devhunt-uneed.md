# JAA-246 - dev.to writeup + Devhunt and Uneed submissions

## dev.to writeup

**Title:** How I rebuilt an OpenCode plugin around a Chrome side panel

**Outline (write it as a build log, not a landing page):**

1. The problem: describing visual bugs to a coding agent in text is the slowest part of the loop
2. The fork: what JodusNodus's plugin did well (in-page pill + picker), why I moved the UI out of the page
3. Architecture: side panel app <-> service worker <-> injected selection script; the message flow (`panel_start_annotation` -> `selection_pick` -> `panel_submit_annotation`); screenshot capture and cropping; why `<all_urls>` is requested as an optional permission at use-time, not install-time
4. The state machine for element selection (hover -> locked -> submit), and why reselect beats re-injecting
5. Closing sessions from the panel: the plugin's `/session/close` endpoint over the OpenCode SDK
6. What shipping a Chrome extension with broad permissions taught me about the CWS review
7. Install + links (repo, npm plugin, demo GIF)

Target search terms in title/subtitle: "opencode plugin", "chrome extension for AI coding agents", "annotate website with AI agent".

Cross-link from both READMEs.

## Devhunt (devhunt.org)

- Name: opencode-chrome-annotation
- Tagline: Point at what's broken in your live app. Your agent fixes it.
- Description:

> A Chrome side panel that connects any tab to your OpenCode session. Click an element on the live page, write what should change, and your agent receives the cropped screenshot, the exact selector, and your instruction. Queue multiple annotations and send them at once. Localhost-only, open source (GPL-3.0).

- Link: extension repo. Maker: your GitHub. Launch day: pick a weekday, then share the Devhunt link alongside the X post.

## Uneed (uneed.best)

- Same tagline and description as Devhunt
- Category: Developer Tools
- Pricing: Free / Open Source
- Screenshots: the same three lead shots as the store listing
