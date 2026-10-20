# Privacy Policy — Annotate HTML

**Effective date:** October 20, 2026

Annotate HTML is a browser extension that lets you click on page elements and write feedback. All data stays on your device.

## What we collect

Nothing. The extension does not collect, store, or transmit any personal data, browsing history, analytics, or telemetry.

## How it works

When you activate the extension, it injects a script into the current tab that lets you annotate elements. Your annotations exist only in the tab's memory for the duration of the page session. When you close or refresh the tab, they are gone.

The "Copy" button places markdown text onto your clipboard. No data is sent to any server.

## Screenshots

When you add an annotation, the extension captures the visible part of the current tab, crops it to the element you annotated, and saves a JPEG to your own Downloads folder:

```
~/Downloads/annotate-html/<site>-<date>-<time>/ann-01.jpg
```

Screenshots are written locally, never uploaded, and never leave your machine except where you choose to send them — for example by pasting the copied markdown into your own AI tool. Deleting the folder deletes the images; nothing is retained anywhere else.

## Permissions

- **activeTab** — Access the current tab only when you click the extension icon or use the keyboard shortcut.
- **scripting** — Inject the annotation script into the current tab.
- **downloads** — Save the screenshot of each annotation into your Downloads folder and read back its absolute file path for the copied markdown.

No background data access. No cross-site tracking. No remote requests.

## Third parties

None. The extension makes zero network requests.

## Contact

Questions or concerns: [github.com/AsimSayed/annotate-html/issues](https://github.com/AsimSayed/annotate-html/issues)
