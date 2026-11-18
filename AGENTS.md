# AGENTS.md — tea-annotate

Working notes for anyone changing this repository, human or agent. It is written
to be read cold: the layout is small, but several invariants are load-bearing and
invisible, and breaking one produces a tool that looks fine and behaves badly.

## What this is

A dependency-free, build-step-free Chrome MV3 extension. Point at an element,
describe what should change, and copy or download a YAML packet an AI coding
agent can act on — with a full-viewport screenshot per annotation.

```
annotate.js          the entire UI and logic: one ES5-compatible IIFE, no imports
extension/           the folder you actually load in the browser
  manifest.json      MV3 manifest
  background.js      service worker: injection, capture, downloads
  annotate.js        GENERATED copy of ../annotate.js — never hand-edited
  sync.sh            regenerates that copy
  icons/             icon.svg plus 16/32/48/128 PNGs
demo.html            loads annotate.js with a plain <script>; design scratch only
README.md            user-facing behaviour
FORK-NOTES.md        lineage, licence provenance, every deviation from upstream
LICENSE              the original MIT notice, verbatim
```

No bundler, no package manager, no transpiler, no test runner installed. The
file stays valid in a browser exactly as committed, which is the property that
makes it installable by Loading an unpacked extension in four steps. Keep it.

## Invariants

1. **`extension/annotate.js` is generated.** Edit `annotate.js`, then run
   `./extension/sync.sh`, then assert they are identical. Chrome rejects `..` in
   manifest paths, so the duplication is structural, not laziness. A commit that
   touches one copy and not the other ships a stale bundle.
2. **Stay ES5-compatible and dependency-free.** No `import`, no npm, no build.
   Arrow functions, `const`/`let`, template literals and optional chaining are
   fine — the file already uses them — but nothing that needs compiling, and no
   runtime fetch of a CDN.
3. **The packet schema is frozen.** `schema: annotate-html/v1` stays, even though
   the project is called tea-annotate. Agents and stored prompts match on that
   string; renaming a wire format for cosmetics breaks consumers. Add optional
   fields instead.
4. **The top-layer root is not a styling preference.** The floating UI lives in a
   `popover="manual"` element shown with `showPopover()`, because real host apps
   put panels at `z-index: 2147483647` or inside `transform`ed ancestors, which
   no z-index can beat. Marker pins deliberately stay outside it, in document
   coordinates — top-layer children position against the viewport, so moving them
   in would mean recomputing every pin on scroll.
5. **Never re-enable pointer events with a universal selector.**
   `#ann-root *{pointer-events:auto}` out-ranks the class rules that keep
   always-present overlays inert, and an invisible overlay then swallows every
   click on the toolbar while keyboard shortcuts keep working, because they never
   hit-test. Opt widgets in by id and let descendants inherit.
6. **Storage is the source of truth; files on disk are receipts.** Live state is
   `chrome.storage.local` keyed by origin plus pathname. The `annotations.yaml`
   written beside the screenshots is a copy for humans and agents — an extension
   cannot read back a file it wrote, so nothing may depend on reading it.
7. **File deletion is regex-gated.** Anything passed to `chrome.downloads.removeFile`
   must match the exact per-page pattern in `background.js`. Never delete by glob
   or by directory: one bad path and the tool is deleting a user's Downloads.
8. **Design edits are previews, not page ownership.** A design change is applied
   inline so the user can see it, but it is recorded as a `from → to` pair, and
   reverting removes the inline property so the stylesheet value returns. Do not
   "improve" this by writing into stylesheets or persisting edits across reloads
   in a way that leaves the page silently modified.

## Commands

```bash
node --check annotate.js
node --check extension/annotate.js
node --check extension/background.js
./extension/sync.sh
diff -q annotate.js extension/annotate.js
python3 -c 'import json; json.load(open("extension/manifest.json"))'
```

Then bump `extension/manifest.json` `version` in the same commit as any behaviour
change: someone is loading this unpacked and the version is the only way they can
tell what they are running.

## Testing

Linting proves syntax, not behaviour. Load the bundle:

```bash
chromium --headless=new --no-sandbox \
  --disable-extensions-except=<path-to-extension> \
  --load-extension=<path-to-extension> \
  --remote-debugging-port=9222 <test-page-url>
```

Drive it over raw CDP (`/json/list`, then a WebSocket to the target). Notes that
save real time:

- **Pick the service worker by manifest name.** `/json/list` also lists Chromium's
  own component extensions, and one of them answers `chrome.runtime.getManifest()`
  before you do.
- **Real input only.** `Input.dispatchMouseEvent` press+release at an element's
  centre, `Input.dispatchKeyEvent` with `key`, `code` and `windowsVirtualKeyCode`.
  `element.click()` bypasses hit testing, which is exactly how a pointer-events
  regression passes a test suite.
- **`activeTab` cannot be granted over CDP** — there is no user gesture. For tests,
  copy the extension to a scratch directory and add
  `host_permissions: ["http://127.0.0.1:<port>/*"]` to the copy. Never add host
  permissions to the shipped manifest just to make a test pass.
- **Downloads need a profile preference, not `Browser.setDownloadBehavior`,**
  which flattens every filename to `download` and makes path logic look broken.
  Write `<profile>/Default/Preferences` before launch:
  `{"download":{"default_directory":"<dir>","prompt_for_download":false}}`.
- **`demo.html` tests the wrong channel.** It loads the script with a plain
  `<script>`, so `chrome.*` is undefined and extension features silently no-op
  while the toggle still works. Test extension behaviour on a page that loads no
  scripts.
- **Screenshot capture cannot be proven headless.** `captureVisibleTab` needs a
  real visible window and degrades quietly. Report that gap rather than claiming
  the check passed.

Useful synthetic pages: one bare page with no scripts, one hostile page with a
rail and a drawer at maximum z-index (rail inside a `transform`ed wrapper) to
prove the top layer, and one small card layout for element-navigation and design
work. In the hostile page, assert that the *page's* own top element at the drawer
centre is the drawer — otherwise the test proves nothing.

## Design

Warm dark surface, one hojicha-gold accent, cream primary action, red as the
default marker colour. Gold is reserved for the pin, the active state and focus —
the moment it is also a button fill and a link colour it stops meaning "active".

- Prove contrast arithmetically for every muted role. A plausible grey on the
  dark surface can land under 4.5:1 and fail 12px text.
- Icon legibility is decided at 16 and 32 px, not at 128. Render the mark at
  those sizes and look at it before committing it.
- Keep chrome quiet: one icon set, one type ramp, no letter-spaced uppercase
  micro-labels, no per-item colour rainbows.

## Attribution and licence

- `LICENSE` is the upstream MIT notice, verbatim. The credit also sits in the
  header of `annotate.js` so it travels when the file is copied out of the repo.
- `FORK-NOTES.md` records lineage, what was dropped, and where an idea came from.
  Add to it when behaviour diverges from upstream.
- Ideas borrowed from other projects are reimplemented here, not copied, when
  their licence does not permit copying — see the note in `FORK-NOTES.md` about
  the source of the keyboard walk and the design tab. Check a licence before
  lifting anything; "public on GitHub" is not the same as "open source".

## Keeping this file honest

Anything in it that stops being true is worse than nothing. If you change the
layout, the schema, the permissions, or an invariant, update this file and the
README in the same commit, and keep machine-specific detail — local paths, host
names, personal settings — out of the repository entirely.
