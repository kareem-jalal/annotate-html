# annotate-html

## Project Overview

A zero-dependency visual feedback tool for AI coding agents. Drop a single `<script>` tag into any HTML page to enable click-to-annotate element identification with structured markdown output. Designed for plain HTML sites that cannot use React-based alternatives. Users annotate elements in-browser, then paste the structured output into Claude Code, Cursor, or other AI coding agents.

## Stack / Tech

- **Language:** Vanilla JavaScript (ES5 IIFE, no modules)
- **Dependencies:** None — no build step, no framework, no npm
- **CDN:** Served via jsDelivr from GitHub (`@main` tag)
- **Hosting:** GitHub Pages (landing page at `index.html`)

## Repo Structure

```
annotate-html/
├── annotate.js          # The tool (~708 lines, single IIFE)
├── index.html           # Landing / marketing page
├── demo.html            # Minimal page to test annotations
├── versions/            # Previous landing page iterations
├── README.md
└── LICENSE              # MIT
```

## Build and Run

```bash
# No build step:
open index.html          # Landing page
open demo.html           # Test annotations
```

## Non-negotiables

- **Zero dependencies.** Never add npm, a bundler, or a framework.
- **ES5-compatible IIFE.** Must work in any browser via a `<script>` tag.
- **Self-contained styles.** All CSS injected by JS at runtime.
- **No side effects on host page.** All state scoped inside the IIFE closure.
- **Clipboard output is markdown.** Clean, structured markdown that AI agents can parse.
- **Preserve the 4 detail levels.** compact, standard, detailed, forensic.
- **Every annotation carries the full page URL** (`window.location.href` at click time), not just the pathname. SPAs change URLs without reloading, so per-annotation URLs are authoritative.
- **Screenshots only through the extension.** The page cannot screenshot itself without a dependency, so `annotate.js` asks the MV3 service worker for `captureVisibleTab` and degrades silently when `chrome.runtime` is absent. Never add html2canvas or similar.
