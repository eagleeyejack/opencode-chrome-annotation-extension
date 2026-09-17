# JAA-232 - Merge the extension and plugin PRs after a live smoke test

## Live smoke test (before merging either PR)

1. Plugin repo is on `close-session-endpoint`, built (`bun run build`), and OpenCode restarted. Verify: `curl http://127.0.0.1:39240/status` shows `"version":"1.2.0"`.
2. Chrome has the unpacked extension from the `side-panel` branch. Reload from `chrome://extensions`.
3. Run the full flow on a real page:
   - Click the extension icon, connect the tab to a session from the panel
   - Select element, write instruction, Add to queue (repeat 2-3 elements)
   - Remove one item from the queue, then Send all
   - Confirm OpenCode receives screenshot + selector + instruction
   - Open settings (gear), check the linked chat label, disconnect
   - Close a session with the x button (two-click confirm)
4. Repeat the annotate flow in DevTools mobile emulation (narrow viewport).
5. Check the service worker console (`chrome://extensions` > service worker link) for errors during the flow.

## Merge

1. Merge https://github.com/eagleeyejack/opencode-chrome-annotation/pull/1 (plugin, `close-session-endpoint` -> `main`)
2. Merge https://github.com/eagleeyejack/opencode-chrome-annotation-extension/pull/1 (extension, `side-panel` -> `main`)
3. Delete both feature branches
4. `git checkout main && git pull` in both repos, rebuild the plugin dist
5. Tick off the two Linear issues

## Post-merge sanity

- `curl http://127.0.0.1:39240/status` -> v1.2.0
- Extension loads from `main` and the panel renders
