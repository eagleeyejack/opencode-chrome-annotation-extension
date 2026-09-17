# JAA-245 - GitHub topics, badges, and repo polish

## Topics (both repos)

`opencode` `chrome-extension` `ai-coding` `annotation` `developer-tools`

(Settings > General > Topics - lowercase, no spaces.)

## Repo descriptions

- Extension: `Point-and-click annotations for your OpenCode agent. Click the broken element; the agent gets the screenshot and selector.`
- Plugin: `OpenCode plugin that receives page annotations (screenshots, selectors, instructions) from the Chrome extension.`

## README hero section (insert above "How It Works")

```markdown
<p align="center">
  <img src="demo.gif" alt="Click an element on any page, annotate it, send it to your OpenCode agent" width="640">
</p>

# OpenCode Chrome Annotation

**Point at what's broken. Your agent fixes it.**

[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)
[![npm](https://img.shields.io/npm/v/@eagleeyejack/opencode-chrome-annotation)](https://www.npmjs.com/package/@eagleeyejack/opencode-chrome-annotation)
```

(After the demo GIF lands in the repo root, and after npm publish for the badge.)

## Install section (make the one-liner first)

```markdown
## Install

**Agent side:** add the plugin to your OpenCode config:

    { "plugin": ["@eagleeyejack/opencode-chrome-annotation@latest"] }

**Browser side:** load this repo unpacked (chrome://extensions > Developer mode), or grab it from the Chrome Web Store: <link when live>
```

## Profile

- Pin the extension repo on your GitHub profile
- Social preview: a frame from the demo (panel + page), not just the logo
