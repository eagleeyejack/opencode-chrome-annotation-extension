# JAA-239 - PR into the OpenCode docs ecosystem page

## Repo / file

- Repo: https://github.com/anomalyco/opencode
- File: `packages/web/src/content/docs/ecosystem.mdx`
- Location: the **Plugins** table, append at the end (rows are appended, not sorted)

## The row (copy-paste)

```md
[opencode-chrome-annotation](https://github.com/eagleeyejack/opencode-chrome-annotation-extension) | Annotate any webpage in Chrome: click an element, send its screenshot, selector, and your instruction straight into a session
```

## PR title

> docs(ecosystem): add opencode-chrome-annotation

## PR body (copy-paste)

> Adds [opencode-chrome-annotation](https://github.com/eagleeyejack/opencode-chrome-annotation-extension) to the Plugins table.
>
> It connects a Chrome tab to a local OpenCode session from a side panel: you click an element on the live page, write what should change, and the agent receives the cropped screenshot, the element's exact selector/tag/role/ARIA metadata, and your instruction. Multiple annotations can be queued and sent in one go. Everything runs over 127.0.0.1 to the user's own OpenCode instance - nothing leaves the machine.
>
> The agent side is an npm plugin (`opencode-chrome-annotation`, fork published as `opencode-annotate`); the extension is GPL-3.0 and a credited fork of JodusNodus/opencode-chrome-annotation, rebuilt around a Chrome side panel. Not affiliated with the OpenCode team (note included in the READMEs).
>
> Distinction worth a line in review: @plannotator/opencode covers reviewing agent output (plans, diffs); this one covers annotating the live running UI, which nothing else in the table does today.
>
> Demo GIF attached (also embedded in the repo README).

Attach the demo GIF to the PR (drag into the body).
