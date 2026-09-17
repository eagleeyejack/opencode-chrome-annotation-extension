# JAA-233 - Publish plugin to npm as @eagleeyejack/opencode-chrome-annotation

Never publish under the unscoped `opencode-chrome-annotation` name: it belongs to upstream (JodusNodus).

## Steps

1. On the plugin repo `main` (after JAA-232), edit `package.json`:
   - `"name": "@eagleeyejack/opencode-chrome-annotation"`
   - `"version": "1.2.0"`
   - `"files"` already includes `dist` and `README.md` - keep
   - `"license": "GPL-3.0-only"` - keep
   - Add `"repository"` pointing at `eagleeyejack/opencode-chrome-annotation`
2. Add one line at the top of the plugin README:
   > Fork of [JodusNodus/opencode-chrome-annotation](https://github.com/JodusNodus/opencode-chrome-annotation), published under a scoped name. GPL-3.0.
3. `bun run build && npm whoami && npm publish --access public`
4. Verify in a scratch OpenCode project: set config to

```json
{ "plugin": ["@eagleeyejack/opencode-chrome-annotation@latest"] }
```

   restart OpenCode, confirm `/status` reports 1.2.0 and the extension connects.

## User install line (used everywhere in launch copy)

```json
{ "plugin": ["@eagleeyejack/opencode-chrome-annotation@latest"] }
```
