# annotate-html

Point at things on any webpage. Tell your AI agent what to change.

One script tag. No framework, no build step, no dependencies. Also ships as a Chrome extension for pages you don't control.

## Install

**Script tag** — add before `</body>`:

```html
<script src="https://cdn.jsdelivr.net/gh/AsimSayed/annotate-html@main/annotate.js"></script>
```

**Chrome extension** — for any page, no code changes needed:

1. Clone this repo
2. `chrome://extensions` → Developer mode → Load unpacked → select `extension/`
3. Click the asterisk icon on any tab (or press `Alt+Shift+A`)

Both channels run the same `annotate.js`. The Chrome extension additionally screenshots the whole viewport with the annotated element highlighted in red; the `<script>` tag can't, so its output omits the image lines.

## How it works

1. A toolbar appears bottom-right. Click **Annotate** or press `Alt+A` — an asterisk cursor appears
2. Hover any element to see its selector and highlight. Click to open a popup with computed styles and a feedback field
3. Markers drop at your click position. Hover to preview, click to edit
4. Press `C` to copy all feedback as structured YAML. Paste into Claude Code, Cursor, or any AI coding tool

The toolbar collapses to a round button when closed. Rulers along the top and left edges let you drag out guide lines for alignment.

### Keyboard shortcuts

| Key | What it does |
|---|---|
| `Alt+A` | Toggle annotation mode |
| `C` | Copy YAML |
| `M` | Marker color picker |
| `H` | Show/hide markers, rulers, guides |
| `Cmd/Ctrl+Enter` | Submit annotation |
| `Esc` | Close popup or exit mode |

### Color picker

Click the color swatch or press `M`. Seven colors. Choosing one repaints everything — markers, highlights, cursor, active states, badges, buttons.

## What gets captured

Each annotation records what an AI agent needs to find and fix the right code:

- **Full page URL** — origin, path, query and hash, captured at the moment you click
- **Element name** — `button "Download"`, `h2 "Features"`, `image "hero.png"`
- **Selector path** — `.hero > .cta > .btn-primary`
- **CSS classes, bounding box, computed styles**
- **Selected text** (if you highlight before clicking)
- **Nearby text context** from sibling elements
- **Accessibility info** — role, aria-label, focusable
- **A full-viewport screenshot** with a red highlight box around the element, in the Chrome extension only — the copied YAML carries the image as base64 in a bottom `images:` block, so pasting to an agent needs no screenshot folder

### Example output

The clipboard payload is YAML with an agent-facing header comment: metadata first, image blobs only at the very bottom, so an agent can read the whole packet cheaply and skip the base64 unless it actually needs the pixels.

```yaml
# annotate-html page feedback - a structured annotation packet for AI agents.
# Each entry under `annotations:` is one element-level note from a human reviewer:
# `feedback` says what to change, `xpath`/`location` say exactly where.
# Reading this cheaply: all metadata is above; the ONLY bulk is the `images:`
# block at the very bottom. To skip the base64, read up to the line starting
# with `images:` and ignore everything after it.
# Screenshots are full-viewport JPEGs with the annotated element outlined in red.
# Prefer `screenshot.path` when present - the same JPEG is already on disk.
# To decode an inline image (id N) to a viewable file:
#   awk -v id=N '$0=="images:"{p=1;next} p&&$1==id":"{sub(/^[^,]*,/,"");print;exit}' FILE | base64 -d > shot-N.jpg
# or in Python: after splitting the text on the line `images:`, take the line
#   starting `N: `, cut everything up to the first comma, base64-decode the rest.
#
schema: annotate-html/v1
generated: "2026-11-15T02:04:11.221Z"
page:
  url: "https://example.com/index.html?v=2#pricing"
  title: "Example — Pricing"
  viewport: "1440x900"
annotation_count: 2
annotations:
  - id: 1
    element: "button \"Download for macOS\""
    url: "https://example.com/index.html?v=2#pricing"
    location: ".hero > .wrap > .hero-actions > .btn-primary"
    xpath: "/html/body/div[1]/section[2]/div/div[3]/button[1]"
    css_classes: "btn-primary"
    position: {x: 420, y: 380, width: 180, height: 48}
    feedback: "Make the border-radius softer, more like 100px pill shape"
    screenshot:
      path: "/home/you/Downloads/annotate-html/example.com-20261020-153012/ann-01.jpg"
      kb: 24
  - id: 2
    element: "h2 \"Built with Swift.\""
    url: "https://example.com/index.html?v=2#pricing"
    location: ".native-section > .wrap > .vis"
    feedback: "Font weight feels too heavy here, try 600 instead of 700"

images:
  1: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...
```

## Screenshots

The Chrome extension screenshots the page the moment you press **Add** — full viewport, downscaled to 1280px wide, with the element outlined in red on the image — and writes a JPEG to:

```
~/Downloads/annotate-html/<host>-<YYYYMMDD>-<HHMMSS>/ann-01.jpg
```

One folder per page session, one file per annotation. The copied YAML carries the image itself as a `data:image/jpeg;base64,...` value in the bottom `images:` block — so a single paste into an agent is self-contained — while `screenshot.path` + `kb` up top let an agent use the saved file (or skip the pixels entirely) without decoding anything. The full viewport is kept so tiny elements still come with their surroundings. Screenshot capture pauses the tool's own overlays and pins first, so they never appear in the image, and a failed capture just drops the image keys — the annotation still records everything else.

The `<script>` tag channel cannot take screenshots (a page can't capture itself without a dependency), so it skips this and its output has no `screenshot:` keys. The full URL, which needs no special access, is captured in both channels.


## License

MIT

## Credits

Element identification approach adapted from [Agentation](https://github.com/benjitaylor/agentation) (MIT). Built by [Asim Sayed](https://asimsayed.com).
