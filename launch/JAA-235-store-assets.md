# JAA-235 - Store assets: screenshot mapping, tiles, and listing copy

## Screenshot shot list (you have the raw shots - map and caption these)

Order matters: the first three are what reviewers and users actually look at.

| # | Shot | On-image caption (short, white text bottom-left) |
|---|---|---|
| 1 | Side panel over a real page, session list visible | "Connect the tab to your OpenCode session" |
| 2 | Element selected, annotate form open in panel | "Click any element. Tell the agent what to change." |
| 3 | Queue with 2-3 annotations | "Queue annotations across the page. Send all at once." |
| 4 | OpenCode receiving/acting on the annotation | "Screenshot, selector, and instruction - straight to the agent" |
| 5 | Session list with the close (x) buttons | "Close stale sessions from the panel" |

- Size: 1280x800 (or 640x400). Crop tight, browser chrome visible is fine, dark browser theme works well against the light panel
- No mockups or fake dashboards - reviewers reject those

## Promo tiles

- Small tile 440x280: extension logo + "Point. Annotate. Ship." on dark background
- Marquee 1400x560 (optional): "Show your agent what's broken" + small flow diagram (select -> annotate -> send)

## Listing copy

**Name:** OpenCode Chrome Annotation

**Short description (132 char limit):**

> Annotate any webpage and send screenshots, element selectors, and instructions to your OpenCode agent.

**Category:** Developer Tools

**Detailed description:**

> Describe UI bugs by pointing at them, not typing paragraphs.
>
> OpenCode Chrome Annotation adds a side panel to Chrome that connects any tab to your local OpenCode session. Click an element on the page, write what should change, and the extension sends the cropped screenshot, the element's exact selector, and your instruction straight into your agent's session.
>
> Built for developers working with OpenCode:
>
> - Select any element: buttons, forms, headings, custom components
> - Each annotation includes a cropped screenshot plus tag, CSS selector, role, ARIA label, and visible text
> - Queue several annotations across the page and send them all in one go
> - Works with DevTools mobile emulation, so you can annotate responsive layouts too
> - Close stale OpenCode sessions right from the panel
>
> How it works:
>
> 1. Run OpenCode with the opencode-annotate plugin
> 2. Click the extension icon and pick your session from the panel
> 3. Click elements on the page, write instructions, send to the agent
>
> Everything is local. The extension talks only to your own OpenCode instance on 127.0.0.1 (ports 39240-39260). No accounts, no analytics, no telemetry.
>
> Open source under GPL-3.0: https://github.com/eagleeyejack/opencode-chrome-annotation-extension

**About section blurb:** A side panel that connects Chrome tabs to your local OpenCode agent. Annotate the live page; the agent gets the screenshot and selector.

## Composed promo images (deterministic, per product-promo-gallery skill)

No AI-generated mockups. All five are HTML/CSS artboards rendered in a browser at exact pixels, built from real assets only. Working dir (outside the repo): `/tmp/opencode/promo/`. Brand rule: the OpenCode **wordmark never appears** on our tiles (endorsement risk) - only the word "OpenCode" in copy. Our logo is always `icon.svg` from this repo (dark tile + indigo #818CF8 bubble-crosshair). Type: system mono stack (ui-monospace, SFMono-Regular, Menlo) to echo OpenCode's terminal aesthetic. Real captures required before composing: the user's 5 real-UI screenshots (shot list above) - tiles 1 and 2 can compose immediately (logo + copy only), tiles 3-5 need the real captures.

**1. Small promo tile - 440x280**
Artboard: dark #111111 full-bleed. Center: `icon.svg` mark at 96px. Below: white bold 22px "Point. Annotate. Ship." Grey 13px subline "Send what's broken to your AI agent". QA: mark centered, text exactly as quoted, PNG 24-bit no alpha.

**2. Marquee promo tile - 1400x560**
Artboard: dark #111111. Left third (padding 64px): white bold 54px headline "Show your agent what's broken", grey 20px subline "Click an element. The agent gets the screenshot and the selector." Right two-thirds: three real `icons/icon48.png`-style chips replaced by three real mini-captures of the selection highlight box (indigo outline) cropped from the user's screenshot #2, joined by thin #818CF8 rules. Hierarchy: one headline, one subline, real evidence. QA: headline never wraps past two lines, captures sharp at 2x source downscale.

**3. Store hero - 1280x720**
Artboard: dark #111111. Left half: real screenshot #3 (queue with 2-3 items) in a dark browser frame with traffic-light dots, scaled to 560px wide, allowed to bleed below the artboard (editorial crop). Right half: `icon.svg` at 64px, white bold 40px "OpenCode Annotate", grey 18px "Point at what's broken. Your agent fixes it." Install line in mono 14px: `{ "plugin": ["opencode-annotate@latest"] }` (verified against package.json - do not invent). QA: install line character-exact, browser frame intentional, no dev chrome visible in the capture.

**4. Social / OG card - 1200x630**
Artboard: dark #111111. Top safe padding 80px. White bold 56px two-line headline "Point at what's broken. / Your agent fixes it." Grey 20px line: "OpenCode Annotate - open source, GPL-3.0". Bottom-right: `icon.svg` at 120px. Keep all text inside 80px margins (platform cropping). QA: legible at 300px-wide preview.

**5. Trust tile - 440x280**
Artboard: dark #111111. Centered: shield outline in #818CF8 (stroke only) containing white mono "127.0.0.1". Below: white bold 18px "100% local. Nothing leaves your machine." Grey 12px "open source - GPL-3.0". QA: the localhost claim matches the privacy policy (`docs/privacy.html`) and the real architecture - no invented claims.

