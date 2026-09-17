# JAA-234 - Host a public privacy policy page

## Decision: GitHub Pages from this repo

Free, stable URL, no third party, and it doubles as proof of the open-source claim on the store listing.

## Already done

The full policy is written and committed at `docs/privacy.html` in this repo. It covers: what data is handled (page URL/title, element metadata, cropped screenshot, instruction text, session ids), where it goes (nowhere but your own machine, 127.0.0.1 only), storage (`chrome.storage.session`, cleared with the browser session), and a permission-by-permission justification table.

## Steps to make it live

1. Merge the PR (JAA-232) so `docs/privacy.html` is on `main`
2. GitHub repo > Settings > Pages > Build and deployment > Source: "Deploy from a branch" > Branch: `main` > Folder: `/docs` > Save
3. Wait for the first deployment, then verify:
   https://eagleeyejack.github.io/opencode-chrome-annotation-extension/privacy.html
4. Record that URL - it goes into the CWS listing (JAA-236) and the "Privacy policy" field of the store item

## Alternatives if you prefer

- Cloudflare Pages (same repo, also free)
- A gist is NOT suitable: reviewers want a page, not raw markdown
