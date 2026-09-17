# JAA-236 - Submit the extension to the Chrome Web Store (new listing)

The existing `abeihanp...` listing belongs to upstream JodusNodus. Submit your own under the eagleeyejack account. One-time $5 developer registration if you have not paid it.

## Package

Zip exactly: `manifest.json`, `background.js`, `sidepanel.html`, `sidepanel.js`, `injected/`, `icons/`, `LICENSE`. Do not include `launch/`, `docs/`, `.git*`.

```
zip -r opc-chrome-annotation-1.3.0.zip manifest.json background.js sidepanel.html sidepanel.js injected icons LICENSE -x '.*'
```

Version in manifest: 1.3.0 (matches the PR). A ready-to-upload zip built from main is at `~/Downloads/opencode-chrome-annotation-1.3.0.zip` - rebuild it after any code change with the zip command below.

## Listing fields

- Name, descriptions, screenshots, tiles: copy from JAA-235
- Privacy policy URL: from JAA-234
- Category: Developer Tools
- Language: English
- Regions: all
- Visibility: Public (set at publish, JAA-237)

## Reviewer notes (paste into "Why are you requesting these permissions?")

> OpenCode Chrome Annotation connects a browser tab to the user's own locally running OpenCode AI coding session so the user can annotate a page and send the selected element's screenshot and metadata to their agent.
>
> - **activeTab + optional <all_urls>**: The core feature requires running a small element-selection script on the page the user is annotating and capturing a cropped screenshot of the element they click. We request the broad host permission as an OPTIONAL permission at the moment the user first starts an annotation session - it is never requested at install and only ever granted by explicit user action in the side panel.
> - **sidePanel**: hosts the extension's entire UI (session picker, annotate form, queue) in Chrome's side panel so it never overlays the page being annotated.
> - **tabs**: identifies the active tab so annotations attach to the correct session and so the visible tab can be captured for the screenshot.
> - **scripting**: injects the selection highlight and screenshot-cropping code into the page being annotated, only after the user starts annotating.
> - **storage (session)**: persists tab-to-session claims and the annotation queue across service worker restarts, for the current browser session only.
> - **host_permissions 127.0.0.1 / localhost**: discovers the user's local OpenCode server (ports 39240-39260) to deliver annotations. All data stays on the user's machine.
>
> Single purpose: annotating web pages and sending that context to the user's local OpenCode instance.
>
> No remote code, no analytics, no third-party network calls of any kind.

## Data usage disclosures (store "Data usage" tab)

- Does the item collect user data? **Yes** - be conservative, then explain:
  - Website content (screenshot of the element the user selects, page URL/title, element metadata): collected **only** with user action, transmitted **only** to the user's own machine (localhost), not transferred to third parties, **not** used for advertising, **not** sold
  - User-provided text (the annotation instruction): same - local only
- No compliance requirement beyond Item minimum: answer "does not comply" to remote-data-use follow-ups where the honest answer is no third-party transfer
- Privacy policy URL from JAA-234

## Before hitting submit

- `node --check` every JS file, JSON-validate the manifest one more time
- Load the zipped version fresh in a clean profile and run the full flow once
- Note: review for `<all_urls>` extensions commonly takes several business days
