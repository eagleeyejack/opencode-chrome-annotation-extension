# JAA-238 - Demo recording script (30-60s)

One recording, exported as GIF (README, ecosystem PR, Discord) and MP4 (X, Show HN). Silent recording; captions carry it.

## Setup

- Page being annotated: your real dev app (imperfect UI on purpose - pick 2 genuinely fixable spots)
- OpenCode running and connected, side panel docked right, page left
- Screen size ~1440x900, browser zoom 100%, hide bookmarks bar, close other tabs
- Use a screen recorder that can do 2x speedup in the edit (CleanShot, Screen Studio, OBS + ffmpeg)

## Shot list

| Time | Action | Caption |
|---|---|---|
| 0-4s | Side panel with session list, click a session | "Connect the tab to your OpenCode session" |
| 4-10s | Click "Select element", hover the page (highlight box visible), click a broken element | "Click the thing that's wrong" |
| 10-16s | Type the instruction, Add to queue. Green "Added" tick visible | "Write what should change. Queue it." |
| 16-22s | Second selection on another element, short instruction, Add to queue | "Queue as many as you need" |
| 22-27s | Click "Send all to OpenCode" | "Send everything in one go" |
| 27-35s | Switch to OpenCode receiving the annotations, agent starts working on the real fix | "Your agent gets the screenshot, the selector, and the instruction" |
| 35-42s | (Optional) Session list, click x on a stale session, "Sure?", closed | "Old sessions? Close them from the panel." |

## Edit notes

- Total 30-45s at natural speed; speed up typing segments 2-4x
- Crop captions large enough to read in a GIF at ~600px wide
- Export: MP4 (H.264, <=10MB for X) and GIF (<=640px wide for GitHub)
- Keep the terminal/agent visible in the final shot - that's the payoff
