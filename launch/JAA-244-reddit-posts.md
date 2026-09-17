# JAA-244 - Reddit posts (staggered, one per day)

General rules: demo GIF as the first item, honest fork background, link in the body or per sub rules. Never cross-post the same day as Show HN.

## r/ChatGPTCoding

**Title:** I built a Chrome extension to point at UI bugs instead of describing them to my agent

**Body:**

> Describing a visual bug to a coding agent always went like: "the CTA in the pricing section... no, below the toggle..." plus a hand-cropped screenshot. So I built the thing I wanted: a side panel that connects the tab to my OpenCode session. Click the element, type what should change, queue more, send all. The agent gets the cropped screenshot, the exact selector, tag/role/ARIA, and my instruction.
>
> - Side panel UI, never covers the page
> - Everything over localhost - no accounts, no telemetry
> - Queue multiple annotations, send in one go
> - Works with DevTools mobile emulation
>
> It's open source (GPL-3.0), an honest fork of JodusNodus's opencode-chrome-annotation rebuilt around the side panel. Plugin: one config line. Repo + demo: <link>

## r/LocalLLaMA

**Title:** Local-first visual feedback for coding agents: click the broken element, the agent gets the screenshot + selector

**Body:**

> I run OpenCode locally and wanted the whole loop to stay on my machine - including the "look at this broken button" part. So: a Chrome side panel that queues click-annotations (screenshot of the element + CSS selector + your note) and sends them to your local agent over 127.0.0.1. Nothing hits a third party. No account, no telemetry.
>
> Works with whatever model you run OpenCode with. GPL, source available, fork of an existing GPL plugin (credited). Repo + demo GIF: <link>

## r/webdev

**Title:** The fastest way I've found to file visual bugs: click the element, the agent fixes it

**Body:**

> My feedback loop for UI fixes used to be: screenshot > crop > write where it is > paste into the agent > agent guesses wrong > repeat. Now it's: click the element in the live page, type what should change, send. The annotation carries a cropped screenshot, the exact selector, and ARIA/role metadata, so the agent edits the right node first try.
>
> It's a Chrome side panel connected to an OpenCode session (queue multiple, send all at once). Localhost-only, open source, GPL. Repo + demo: <link>

## Timing

- Space them at least a day apart
- Check each sub's rules on self-promotion before posting (some want text posts only)
