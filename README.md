# tea-annotate

Point at any element on a page, write what should change, and copy the whole
result as a structured packet an AI coding agent can act on. Chrome extension,
no build step, no dependencies.

A branded fork of [annotate-html](https://github.com/AsimSayed/annotate-html) by
Asim Sayed (MIT) — same mechanism, house palette and name. See
[FORK-NOTES.md](FORK-NOTES.md) for what changed and why.

Use it when a UI detail is easier to point at than to describe: open the page,
annotate three elements, paste the packet into your agent.

## Install (load unpacked)

1. Clone this repository and find `Browser Tools/annotate-html/extension/`.
2. Open `chrome://extensions` and toggle **Developer mode** (top right).
3. **Load unpacked** → select the `extension/` folder.
4. Pin **tea-annotate** to the toolbar.

Re-load the extension (`chrome://extensions` → reload icon) after pulling a new
version of this folder.

## Usage

1. Click the toolbar icon — or press **Alt+Shift+A** — on any tab. The toolbar
   appears in the bottom-right corner.
2. Click **Annotate** or press **Alt+A**. Hover an element to see its selector
   and highlight, then click it.
3. Write the feedback in the popup and submit. A numbered marker drops at the
   click position; hover a marker to preview, click it to edit.
4. Press **C** to copy every annotation as one YAML packet, then paste it into
   your agent — or **D** / the download icon to save it as a file.

The toolbar collapses to a round button when closed and can be dragged out of
the way. Rulers slide in along the top and left edges for alignment checks.

### Keyboard shortcuts

| Key | What it does |
| --- | --- |
| `Alt+Shift+A` | Toggle the toolbar (rebind in `chrome://extensions/shortcuts`) |
| `Alt+A` | Toggle annotation mode |
| `C` | Copy the YAML packet |
| `D` | Download the YAML packet to disk |
| `M` | Marker colour picker |
| `H` | Show/hide markers, rulers and guides |
| `Cmd/Ctrl+Enter` | Submit the open annotation |
| `Esc` | Close the popup, or leave annotation mode |

## What the packet contains

A YAML document, `schema: annotate-html/v1`, with an agent-facing header comment.
Everything cheap comes first and the only bulk — base64 JPEGs — sits in a single
`images:` block at the bottom, so an agent can read the metadata and stop before
the pixels.

- Full page URL per annotation, captured at click time (SPA-safe)
- Element name, selector path and full XPath
- CSS classes, bounding box, computed styles and accessibility info
- Selected text when you highlight before clicking, plus nearby text context
- A full-viewport JPEG with the element outlined in red, saved to disk **and**
  embedded as base64 (`images:`), so one paste is self-contained

`state.detailLevel` selects the field set — `compact`, `standard`, `detailed`
(default) or `forensic` — but there is no UI switch for it; change the constant
in `annotate.js` if you need a different level.

## Screenshots

Pressing **Add** asks the extension's service worker to capture the visible tab,
downscales it to 1280px wide, draws the element outline, and writes a JPEG to:

```
~/Downloads/annotate-html/<host>-<YYYYMMDD>-<HHMMSS>/ann-01.jpg
```

The tool's own toolbar, pins and hover highlight are hidden during capture, so
they never appear in the image. If the capture fails the annotation is still
recorded; the `screenshot:` and `images:` keys are simply absent.

## Persistence

Annotations survive a reload, a crash and a browser restart. Two layers, both
local — nothing leaves the machine:

**1. Live state — `chrome.storage.local`.** Every annotation, the marker colour
and the screenshot folder are saved per page (keyed on origin + pathname, so
query strings and `#hash` on an SPA do not split one page across buckets). After
a reload, reopen the toolbar with the icon or **Alt+Shift+A** and the pins come
back with a `Restored N annotation(s)` toast. Restored annotations keep their
ids, so new ones never collide. The store is capped at the 30 most recent pages
or 14 days, whichever comes first; the `unlimitedStorage` permission is what
lets the inline base64 JPEGs live there too.

**2. Readable copy — `annotations.yaml` on disk.** The same packet is written to
the screenshot folder, overwritten in place:

```
~/Downloads/annotate-html/<host>-<YYYYMMDD>-<HHMMSS>/annotations.yaml
```

The write is debounced (2.5s after the last edit) and skipped when the content
hash has not changed, so editing one comment rewrites one file instead of
stacking copies. Leaving or backgrounding the tab flushes it immediately. This
layer is what survives the browser entirely: `grep` the folder, hand the file to
an agent, keep it in a work note.

**The Download button.** The toolbar's download icon — or `D` — writes the packet
on demand through the same path, so it lands beside the screenshots and
overwrites in place instead of stacking copies. Copy (`C`) remains the
clipboard route; Download is for when you want a file on disk right now.

**One file, three channels.** The same `annotate.js` saves in every context it can
run in: `chrome.storage.local` inside the extension, `GM_setValue` /
`GM_getValue` inside a userscript manager, `localStorage` when it is loaded as a
plain `<script>`. Downloads follow the same pattern — the service worker by
default, `GM_download` under a manager, and an object URL on a temporary anchor in
a plain page. The only genuinely extension-only capability is the screenshot,
because nothing outside an extension can reach `captureVisibleTab`.

### Drawing above the host application

The toolbar, hover highlight and popup live in a root opened as a
`popover="manual"`, which puts them in the browser's **top layer**. That beats
application chrome a plain `z-index` cannot: fixed sidebars at
`z-index: 2147483647`, rails trapped inside a transformed ancestor, drawers and
`<dialog>` modals. The root is `pointer-events: none` so page clicks pass straight
through, and each widget opts back in. Marker pins stay in document coordinates,
so they remain page-absolute and scroll with the content.

### Clearing

- The trash icon in the edit popup removes **one** annotation; hover a pin and
  click it to open.
- The toolbar's trash icon clears **all** annotations for the page. That deletes
  the stored record and removes `annotations.yaml` for the page. Screenshots are
  left on disk, because a packet you already copied may point at them.

Deleting files is deliberately narrow: the service worker removes a file only
when its path matches
`annotate-html/<host>-<YYYYMMDD>-<HHMMSS>/annotations.yaml` exactly, via
`chrome.downloads.removeFile()`. It cannot touch anything else in `~/Downloads`,
and it never deletes a directory.

## Editing this tool

`annotate.js` at the root of this folder is the source of truth.
`extension/annotate.js` must stay byte-for-byte identical, because Chrome
rejects manifest paths containing `..` and so needs a physical copy inside the
bundle. After any edit:

```bash
cd "Browser Tools/annotate-html/extension" && ./sync.sh
node --check ../annotate.js
diff -q ../annotate.js ./annotate.js && echo identical
```

`demo.html` is a small local page for testing annotations without a live
target: open it with the extension enabled and click the toolbar icon.

## Known limitations

- **Screenshots need a visible tab.** `captureVisibleTab` fails on minimised or
  background windows; the annotation still saves without the image.
- **Restricted pages.** `chrome://*`, `chrome-extension://*`, the Web Store and
  the built-in PDF viewer silently do nothing — check the service worker console
  from `chrome://extensions`.
- **Shadow DOM.** `document.elementFromPoint` returns the shadow host rather
  than the shadow child.
- **Iframes.** Only the top frame is instrumented (`allFrames: false`).
- **Only on the tab you activated.** The `activeTab` grant dies when you
  navigate that tab; click the icon again on the new page. That re-invocation is
  also what restores saved annotations after a reload.
- **Persistence is per browser profile.** The stored state lives in the browser
  profile that owns the unpacked extension; a different profile starts empty.
  The `annotations.yaml` sidecar is the portable copy.
- **Markers ride in document coordinates.** Unlike the toolbar, highlight and
  popup, pins are not in the top layer, so an app panel covering that exact spot
  will cover the pin. The annotation is still recorded and appears in the packet.

## License and credits

MIT. See [LICENSE](LICENSE) and [FORK-NOTES.md](FORK-NOTES.md).

- Original `annotate-html` by [Asim Sayed](https://asimsayed.com) —
  [AsimSayed/annotate-html](https://github.com/AsimSayed/annotate-html). This
  folder is Jethur's fork of that project.
- Element-identification approach adapted from
  [Agentation](https://github.com/benjitaylor/agentation) (MIT).
