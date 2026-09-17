# JAA-243 - Show HN

## Title (pick one)

1. Show HN: Point-and-click annotations for your AI coding agent
2. Show HN: Annotate any webpage and send it to your AI coding agent
3. Show HN: I got tired of describing UI bugs to my coding agent

(1 is strongest: it says what it does without naming OpenCode, which widens the conversation.)

## Post text (copy-paste, fill the link)

> Hi HN! I kept filing UI feedback to my coding agent in paragraphs: "the submit button in the pricing section, the one below the toggle..." followed by a screenshot I'd cropped in Preview. It was slower than just pointing at the thing.
>
> So I built a Chrome extension that connects a tab to my OpenCode session. I click the broken element, type what should be different, and the agent receives the cropped screenshot, the exact CSS selector, tag/role/ARIA metadata, and my instruction. I can queue a whole page of annotations and send them in one go.
>
> Implementation notes:
>
> - The UI lives in a Chrome side panel, so it never covers the page you're annotating. Element selection is a small injected script; the service worker handles screenshots (capture + crop) and messaging.
> - Everything stays on 127.0.0.1: the extension talks to a local server the OpenCode plugin runs. No accounts, no telemetry, nothing leaves the machine.
> - It works with DevTools mobile emulation, which is how I annotate responsive issues.
> - Sessions can be closed/removed from the panel; stale OpenCode sessions were piling up on me.
>
> Lineage: this started as a fork of JodusNodus's opencode-chrome-annotation (GPL-3.0), which I rebuilt around the side panel with the agent's blessing in spirit - his original UI overlaid the page; this moves it out. Credit and license intact.
>
> Code + install: <extension repo link>. The agent side is a plugin you add with one config line.
>
> Curious how others file visual feedback to their agents today - happy to answer questions.

## Timing and conduct

- Tuesday-Thursday, 8-10am ET (weekday US morning is the HN window)
- Reply to every comment in the first 2 hours; expect the "why not just paste a screenshot" question (answer: selector + element metadata means the agent edits the right node first try), the "privacy" question (localhost only), and the "fork?" question (GPL allows it, credit kept)
- Do NOT cross-post the HN thread to Reddit/X on the same day
