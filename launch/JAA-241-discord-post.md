# JAA-241 - OpenCode Discord launch post

Where: the showcase / plugins / community-projects channel in discord.gg/opencode. Check pinned channel rules first; some channels want a template.

## Post copy

> **opencode-chrome-annotation - point-and-click annotations for your agent**
>
> I kept describing UI bugs to OpenCode in paragraphs. This makes it one click instead: the side panel connects the tab to a session, you click the broken element on the live page, write what should change, and OpenCode gets the cropped screenshot, the exact selector, and your instruction. Queue a whole page of annotations, send all at once.
>
> - UI lives in a Chrome side panel, so it never covers the page
> - Works with DevTools mobile emulation for responsive stuff
> - Everything over 127.0.0.1 - nothing leaves your machine
> - Close stale sessions from the panel
>
> Honest lineage: it started as a fork of JodusNodus's opencode-chrome-annotation (GPL), which I rebuilt around the side panel - session management, close/delete sessions, dates, queue flow.
>
> Demo GIF attached. Repo: <link>. Plugin: `opencode-annotate` (one config line). Extension: load unpacked, store listing in review.

## After posting

- Reply to every question the same day
- If someone reports an issue, link the GitHub issue you open for them - visible maintenance converts lurkers into users
