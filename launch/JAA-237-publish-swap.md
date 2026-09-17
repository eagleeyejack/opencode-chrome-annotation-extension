# JAA-237 - Publish the CWS listing and swap the README install link

1. When the review passes: Developer Dashboard > the item > set Visibility to Public > Publish
2. Copy the new store URL
3. In the extension repo, replace the README "Install the extension" section:

```markdown
Install the extension from the Chrome Web Store:

<new store URL>

(Or load unpacked from source: chrome://extensions > Developer mode > Load unpacked.)
```

4. Update both repo descriptions and social previews to match the store copy
5. Comment on the CWS listing task with the URL; close JAA-236/JAA-237 in Linear
