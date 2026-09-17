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


## AI image prompts (promo tiles + heroes only - the 5 listing screenshots must be real UI)

All prompts share: flat vector style, dark background #0f1115, indigo accents #818cf8, white bold geometric sans (Inter-like), render exactly the quoted text and nothing else, no gibberish text, no photographic elements.

**1. Small promo tile (440x280)**
Flat vector-style promotional tile, 440x280, dark background #0f1115. Centered: minimal line-art logo of a speech bubble containing a crosshair cursor, drawn in indigo #818cf8 with subtle glow. Below it, bold white sans-serif headline "Point. Annotate. Ship." and small grey subline "Send what's broken to your AI agent". Generous negative space, subtle indigo glow only, no mockups, no gibberish text.

**2. Marquee (1400x560)**
Wide horizontal banner, 1400x560, dark #0f1115. Left third: large white bold sans-serif headline "Show your agent what's broken", smaller grey subline "Click an element. The agent gets the screenshot and the selector." Right two-thirds: abstract three-step flow connected by thin indigo arrows - icon 1: crosshair cursor over a small UI button outline, icon 2: pencil annotating the button, icon 3: paper plane - each icon inside a rounded dark card with indigo accents. Flat vector, minimal text exactly as quoted, no gibberish.

**3. Store hero (1280x720)**
Clean product hero, 1280x720, dark #0f1115. A stylized dark browser window mockup with one UI button highlighted by an indigo #818cf8 glowing selection box. Overlapping the browser's right edge, a small floating white panel card titled "Queued annotations" with two simple list rows. Top-left: line-art speech-bubble-with-crosshair logo + white text "opencode-annotate". Bottom caption in grey: "Point at what's broken. Your agent fixes it." Flat, modern, high contrast, quoted text only.

**4. Social / OG share card (1200x630)**
Social share card, 1200x630, dark #0f1115. Left: bold white two-line headline "Point at what's broken.\nYour agent fixes it." Small grey line beneath: "opencode-annotate - open source, GPL-3.0". Right: the line-art speech-bubble-with-crosshair logo, large, indigo #818cf8 with soft glow. Flat vector, generous margins, quoted text only, no gibberish.

**5. Trust tile (440x280)**
Small flat tile, 440x280, dark #0f1115. Centered: minimal shield outline in indigo #818cf8 containing the text "127.0.0.1" in white monospace. Below, small white bold text "100% local. Nothing leaves your machine." and a tiny grey line "open source - GPL-3.0". Flat vector, quoted text only, no gibberish.
