# Fork notes

## Where this came from

`Browser Tools/annotate-html` is a fork of
[AsimSayed/annotate-html](https://github.com/AsimSayed/annotate-html) by Asim
Sayed, MIT licensed. The upstream project last moved on 2026-05-02; the Jethur
fork started 2026-10-20 and carries changes upstream does not have.

The element-identification approach in both projects is adapted from
[Agentation](https://github.com/benjitaylor/agentation) (benjitaylor, MIT).

The original copyright notice is kept verbatim in [LICENSE](LICENSE) and the
credit also sits in the header of `annotate.js` itself, so it travels with the
file even when copied out of this repository.

## Ideas taken from elsewhere

The keyboard walk and the design tab implement ideas seen in
[vibe-annotations](https://github.com/RaphaelRegnier/vibe-annotations). That
project is source-available under **PolyForm Shield 1.0.0**, not an open-source
licence, so **no code was copied** — both behaviours were reimplemented from
scratch against this file. Their model is worth naming because it shaped ours:
one `pending_changes` map per annotation, applied inline while you edit, exported
as an old → new pair.

## What changed here

- **Keyboard element selection.** Arrows walk the tree in annotation mode
  (↑ parent, ↓ retrace the walked path, ←/→ siblings) and Enter selects, so
  small nested targets do not have to be hit with a pointer. The walk stack is
  cleared whenever the pointer moves, so the two input methods never disagree
  about the anchor.
- **Design tab.** The composer can nudge padding, radius, gap, font size/weight
  and colours on the selected element and applies them live, while the packet
  records a `property: from → to` pair so the agent fixes it in source. The
  preview is inline and reversible; revert, delete, clear and reload all have
  defined behaviour.
Kept from the fork, none of it upstream:

- Rebranded as **tea-annotate** (1.4.0). The original carried the Anthropic
  palette and glyphs; that is gone. In its place: a warm dark surface ramp with a
  single hojicha-gold accent, an icon of a pencil writing on a teacup, a gold reticle cursor, a
  pencil in place of the asterisk mark, and a cream primary action, because on a
  dark surface the off-white fill outranks a coloured one. Gold is reserved for
  the pin, the active state and focus.
- The packet schema stays `annotate-html/v1` on purpose. It is a wire format that
  agents and stored prompts already match, so renaming it for cosmetic reasons
  would break consumers. Attribution to the original author is unchanged:
  LICENSE, the `annotate.js` header, the README and this file.
- Screenshots of the annotated element, requested from the MV3 service worker.
- A full URL captured per annotation at click time, so SPA route changes between
  annotations do not collapse into one page URL.
- Full XPath alongside the CSS selector path.
- Screenshots are now full-viewport JPEGs with a red outline on the element,
  downscaled to 1280px wide, instead of a tight crop — small elements keep their
  surroundings.
- The clipboard payload is a YAML packet (`schema: annotate-html/v1`) with an
  agent-facing header and all base64 in one trailing `images:` block, replacing
  the older markdown output.
- The copy tooltip said "Copy markdown" while the payload was YAML; corrected.
- Annotations persist. State lives in `chrome.storage.local` keyed per page and
  is restored when the toolbar is reopened, so a reload no longer loses work; the
  same packet is also written to `annotations.yaml` beside the screenshots and
  overwritten in place. Both layers are local. Clearing a page deletes its stored
  record and that one YAML file (path-regex gated) and never touches screenshots
  or anything else in `~/Downloads`. See the README's Persistence section.
- A Download button (`D`) writes the packet on demand, next to Copy.
- Storage and downloads are channel-adaptive: `chrome.storage.local` in the
  extension, `GM_*` in a userscript manager, `localStorage` plus an object URL in
  a plain page. This keeps the door open to a userscript build that drops
  screenshots; only the capture itself is extension-only.
- The floating UI was moved into a `popover="manual"` root, so it renders in the
  browser top layer. Upstream's fixed overlay lost to host applications that put
  sidebars at the maximum z-index or inside a transformed ancestor — in those
  apps the hover highlight and the popup were painted over, so users could not see
  what they were selecting or typing.

## What was dropped on import

The upstream repository is also a product page, and none of that belongs in a
utilities repository:

- `index.html` — landing/marketing page, plus `logo-mark.svg` and
  `chrome-webstore-logo.svg`
- `versions/` — v1–v9 iterations of that landing page
- `chrome-store-assets/` — store screenshot PNGs (~500 KB)
- `CNAME` — `annotate.asimsayed.com` Pages domain, meaningless outside the
  original author's hosting
- `CLAUDE.md` — described the pre-fork 708-line file, markdown output and a
  four-level UI that only ever existed as a source constant
- `extension/README.md`, `extension/STORE_LISTING.md`,
  `extension/PRIVACY_POLICY.md` — installation and store copy, folded into the
  single README for this folder; the extension is loaded unpacked internally
  and is not published to the Chrome Web Store

`annotate.js`, `demo.html`, `LICENSE` and the `extension/` bundle are carried
over unmodified apart from the header and tooltip fixes above.

## Not carried over: the CDN channel

Upstream documents installing the tool with:

```html
<script src="https://cdn.jsdelivr.net/gh/AsimSayed/annotate-html@main/annotate.js"></script>
```

That URL serves the *original author's* file, not this fork, so anyone copying
it gets a version without screenshots, XPath or the YAML packet. This folder
ships the extension only. The script still works dropped into a page you
control — copy `annotate.js` into it — but that channel cannot take screenshots
and is not documented as an install path here.
