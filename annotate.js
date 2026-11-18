// =============================================================================
// Annotate.js — visual feedback tool for AI coding agents
//
// Original project: annotate-html by Asim Sayed (MIT)
//   https://github.com/AsimSayed/annotate-html
//   Maintained as a fork called tea-annotate; see FORK-NOTES.md beside this
//   file for lineage and what differs.
// Element identification adapted from Agentation (benjitaylor/agentation, MIT).
//
// No React. No build step. No dependencies.
// Runs two ways, both executing this file:
//   - the extension/ bundle injects it on demand (full features, screenshots)
//   - <script src="annotate.js"></script> in a page you control (no screenshots)
// =============================================================================

(function () {
  "use strict";

  if (typeof window === "undefined") return;

  // ═══════════════════════════════════════════
  // Double-injection guard
  // ═══════════════════════════════════════════
  // If annotate.js has already booted on this page (e.g. Chrome extension
  // clicked twice, or script tag + extension), do NOT build a second toolbar.
  // Instead, ask the existing instance to toggle its visibility and bail.
  if (window.__annotateHtml && typeof window.__annotateHtml.toggle === "function") {
    try { window.__annotateHtml.toggle(); } catch (e) {}
    return;
  }

  // ═══════════════════════════════════════════
  // State
  // ═══════════════════════════════════════════
  const state = {
    active: false,
    annotations: [],
    hoveredEl: null,
    detailLevel: "detailed",
    counter: 0,
    markersHidden: false,
    toolbarHidden: false,
    rulerDragging: false,
    markerColor: "#C4573C",
    shotDir: null,
  };

  var MARKER_COLORS = [
    "#D9A441", "#C4573C", "#8FA96B",
    "#4F8FA6", "#7E6BA8", "#C77D9E", "#5F6B73",
  ];

  // ═══════════════════════════════════════════
  // Element Identification (ported from agentation)
  // ═══════════════════════════════════════════

  function getElementPath(target, maxDepth) {
    maxDepth = maxDepth || 4;
    const parts = [];
    let current = target;
    let depth = 0;
    while (current && depth < maxDepth) {
      const tag = current.tagName.toLowerCase();
      if (tag === "html" || tag === "body") break;
      let id = tag;
      if (current.id) {
        id = "#" + current.id;
      } else if (current.className && typeof current.className === "string") {
        const cls = current.className
          .split(/\s+/)
          .find(function (c) {
            return c.length > 2 && !c.match(/^[a-z]{1,2}$/) && !c.match(/[A-Z0-9]{5,}/);
          });
        if (cls) id = "." + cls.split("_")[0];
      }
      parts.unshift(id);
      current = current.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }

  function identifyElement(target) {
    const path = getElementPath(target);
    const tag = target.tagName.toLowerCase();

    if (target.dataset && target.dataset.element) return { name: target.dataset.element, path: path };

    // SVG
    if (["path", "circle", "rect", "line", "g", "svg"].indexOf(tag) !== -1) {
      return { name: "graphic element", path: path };
    }
    // Buttons
    if (tag === "button") {
      var text = (target.textContent || "").trim();
      var ariaLabel = target.getAttribute("aria-label");
      if (ariaLabel) return { name: 'button [' + ariaLabel + ']', path: path };
      return { name: text ? 'button "' + text.slice(0, 25) + '"' : "button", path: path };
    }
    // Links
    if (tag === "a") {
      var linkText = (target.textContent || "").trim();
      return { name: linkText ? 'link "' + linkText.slice(0, 25) + '"' : "link", path: path };
    }
    // Inputs
    if (tag === "input") {
      var type = target.getAttribute("type") || "text";
      var ph = target.getAttribute("placeholder");
      if (ph) return { name: 'input "' + ph + '"', path: path };
      return { name: type + " input", path: path };
    }
    // Headings
    if (/^h[1-6]$/.test(tag)) {
      var hText = (target.textContent || "").trim();
      return { name: hText ? tag + ' "' + hText.slice(0, 35) + '"' : tag, path: path };
    }
    // Paragraphs
    if (tag === "p") {
      var pText = (target.textContent || "").trim();
      if (pText) return { name: 'paragraph: "' + pText.slice(0, 40) + (pText.length > 40 ? '...' : '') + '"', path: path };
      return { name: "paragraph", path: path };
    }
    // Spans / labels
    if (tag === "span" || tag === "label") {
      var sText = (target.textContent || "").trim();
      if (sText && sText.length < 40) return { name: '"' + sText + '"', path: path };
      return { name: tag, path: path };
    }
    // Images
    if (tag === "img") {
      var alt = target.getAttribute("alt");
      return { name: alt ? 'image "' + alt.slice(0, 30) + '"' : "image", path: path };
    }
    // Containers
    if (["div", "section", "article", "nav", "header", "footer", "aside", "main"].indexOf(tag) !== -1) {
      var role = target.getAttribute("role");
      var ariaL = target.getAttribute("aria-label");
      if (ariaL) return { name: tag + " [" + ariaL + "]", path: path };
      if (role) return { name: role, path: path };
      if (typeof target.className === "string" && target.className) {
        var words = target.className.split(/[\s_-]+/)
          .map(function (c) { return c.replace(/[A-Z0-9]{5,}.*$/, ""); })
          .filter(function (c) { return c.length > 2; })
          .slice(0, 2);
        if (words.length > 0) return { name: words.join(" "), path: path };
      }
      return { name: tag === "div" ? "container" : tag, path: path };
    }

    return { name: tag, path: path };
  }

  function getNearbyText(el) {
    var texts = [];
    var own = (el.textContent || "").trim();
    if (own && own.length < 100) texts.push(own);
    var prev = el.previousElementSibling;
    if (prev) {
      var pt = (prev.textContent || "").trim();
      if (pt && pt.length < 50) texts.unshift('[before: "' + pt.slice(0, 40) + '"]');
    }
    var next = el.nextElementSibling;
    if (next) {
      var nt = (next.textContent || "").trim();
      if (nt && nt.length < 50) texts.push('[after: "' + nt.slice(0, 40) + '"]');
    }
    return texts.join(" ");
  }

  function getClasses(el) {
    if (typeof el.className !== "string" || !el.className) return "";
    return el.className.split(/\s+/).filter(function (c) { return c.length > 0; }).join(", ");
  }

  function getComputedSnapshot(el) {
    var s = window.getComputedStyle(el);
    var parts = [];
    if (s.color && s.color !== "rgb(0, 0, 0)") parts.push("color: " + s.color);
    var bg = s.backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") parts.push("bg: " + bg);
    if (s.fontSize) parts.push("font: " + s.fontSize);
    if (s.fontWeight && s.fontWeight !== "400" && s.fontWeight !== "normal") parts.push("weight: " + s.fontWeight);
    if (s.padding && s.padding !== "0px") parts.push("padding: " + s.padding);
    if (s.margin && s.margin !== "0px") parts.push("margin: " + s.margin);
    var d = s.display;
    if (d && d !== "block" && d !== "inline") parts.push("display: " + d);
    if (s.position && s.position !== "static") parts.push("position: " + s.position);
    if (s.borderRadius && s.borderRadius !== "0px") parts.push("radius: " + s.borderRadius);
    return parts.join(", ");
  }

  function getFullPath(el) {
    var parts = [];
    var cur = el;
    while (cur && cur.tagName && cur.tagName.toLowerCase() !== "html") {
      var tag = cur.tagName.toLowerCase();
      var ident = tag;
      if (cur.id) ident = tag + "#" + cur.id;
      else if (cur.className && typeof cur.className === "string") {
        var cls = cur.className.split(/\s+/).find(function (c) { return c.length > 2; });
        if (cls) ident = tag + "." + cls;
      }
      parts.unshift(ident);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  // Absolute XPath with 1-based sibling indexes: /html/body/div[2]/table/tbody/
  // tr[3]/td[5]/span. Indexes make it unambiguous even for repeated rows/cells,
  // which is exactly where CSS-ish paths go vague. document.evaluate can verify
  // it resolves to this exact element; when it does not (shadow DOM, renamed
  // nodes between capture and copy) we still emit the best-effort path.
  function getXPath(el) {
    var parts = [];
    var cur = el;
    while (cur && cur.nodeType === 1) {
      var tag = cur.tagName.toLowerCase();
      var index = 1;
      var sib = cur.previousElementSibling;
      while (sib) {
        if (sib.tagName && sib.tagName.toLowerCase() === tag) index++;
        sib = sib.previousElementSibling;
      }
      var total = 1;
      sib = cur.nextElementSibling;
      while (sib) {
        if (sib.tagName && sib.tagName.toLowerCase() === tag) total++;
        sib = sib.nextElementSibling;
      }
      parts.unshift(index === 1 && total === 1 ? tag : tag + "[" + index + "]");
      if (tag === "html") break;
      cur = cur.parentElement;
    }
    return "/" + parts.join("/");
  }

  function getA11yInfo(el) {
    var parts = [];
    var role = el.getAttribute("role");
    var ariaLabel = el.getAttribute("aria-label");
    var tabIndex = el.getAttribute("tabindex");
    var ariaHidden = el.getAttribute("aria-hidden");
    if (role) parts.push('role="' + role + '"');
    if (ariaLabel) parts.push('aria-label="' + ariaLabel + '"');
    if (tabIndex) parts.push("tabindex=" + tabIndex);
    if (ariaHidden === "true") parts.push("aria-hidden");
    if (el.matches("a, button, input, select, textarea, [tabindex]")) parts.push("focusable");
    return parts.join(", ");
  }

  // ═══════════════════════════════════════════
  // Screenshots (Chrome extension channel only)
  // ═══════════════════════════════════════════
  // The page itself cannot screenshot itself without a dependency, so this
  // defers to the extension service worker (chrome.tabs.captureVisibleTab) in
  // the ISOLATED world. Under a plain <script> tag none of this runs and the
  // output simply has no screenshot lines.

  var SHOT_MAX_WIDTH = 1280;  // px, downscaled full-viewport output cap
  var SHOT_PAD = 4;           // px of breathing room around the highlight box
  var SHOT_QUALITY = 0.82;

  function extensionRuntime() {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id &&
          typeof chrome.runtime.sendMessage === "function") {
        return chrome.runtime;
      }
    } catch (e) {}
    return null;
  }

  function sendToExtension(message) {
    var rt = extensionRuntime();
    if (!rt) return Promise.resolve(null);
    return new Promise(function (resolve) {
      try {
        rt.sendMessage(message, function (response) {
          // Reading lastError also silences the "unchecked" console warning.
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve(response || null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Capture the visible viewport with the tool's own chrome hidden, so pins,
  // the hover highlight and the toolbar never end up inside the image.
  // Two animation frames let the browser apply the hidden overlays and commit
  // the compositor before capture. A timer fallback matters: rAF is throttled
  // to nothing in a hidden tab, and overlays must never stay hidden because of
  // it.
  function waitForPaint() {
    return new Promise(function (resolve) {
      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        resolve();
      }
      requestAnimationFrame(function () {
        requestAnimationFrame(finish);
      });
      setTimeout(finish, 150);
    });
  }

  function captureViewportShot() {
    // captureVisibleTab captures whatever tab is visible, so a hidden page has
    // nothing meaningful to photograph.
    if (document.visibilityState === "hidden") return Promise.resolve(null);

    var overlays = [hoverHighlight, hoverLabel, markersContainer, toolbar];
    var hidden = [];
    overlays.forEach(function (node) {
      if (node && node.style.visibility !== "hidden") {
        hidden.push(node);
        node.style.visibility = "hidden";
      }
    });
    function restore() {
      hidden.forEach(function (node) { node.style.visibility = ""; });
    }
    return waitForPaint()
      .then(function () { return sendToExtension({ type: "ann-capture" }); })
      .then(function (response) {
        restore();
        return response && response.dataUrl ? response.dataUrl : null;
      }, function () {
        restore();
        return null;
      });
  }

  // Keep the WHOLE viewport in the shot and paint a red highlight box around
  // the annotated element: a crop of a 45x15px cell is useless context, while
  // the full page with the target boxed tells the agent where it lives. The
  // box is drawn on canvas after capture, so it never depends on overlay paint
  // timing and the tool's own chrome stays out of the image.
  function fullShotWithHighlight(dataUrl, rect) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var srcW = img.naturalWidth || img.width;
        var srcH = img.naturalHeight || img.height;
        if (!(srcW > 0 && srcH > 0)) { resolve(null); return; }
        var outW = Math.min(SHOT_MAX_WIDTH, srcW);
        var outH = Math.max(1, Math.round(srcH * (outW / srcW)));
        var canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, outW, outH);
        // captureVisibleTab returns device pixels and the rect is CSS pixels;
        // mapping through the output width handles devicePixelRatio for free.
        var k = outW / (window.innerWidth || srcW);
        var pad = SHOT_PAD * k;
        var x = Math.max(0, rect.x * k - pad);
        var y = Math.max(0, rect.y * k - pad);
        var w = Math.min(outW - x, rect.width * k + pad * 2);
        var h = Math.min(outH - y, rect.height * k + pad * 2);
        if (w > 0 && h > 0) {
          // Two strokes: a dark rim keeps the box legible on pale pages, the gold
          // line keeps it on brand. The pair survives any background.
          ctx.strokeStyle = "#191310";
          ctx.lineWidth = Math.max(3, Math.round(3 * k));
          ctx.strokeRect(x, y, w, h);
          ctx.strokeStyle = "#D9A441";
          ctx.lineWidth = Math.max(2, Math.round(2 * k));
          ctx.strokeRect(x, y, w, h);
        }
        try {
          resolve(canvas.toDataURL("image/jpeg", SHOT_QUALITY));
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = function () { resolve(null); };
      img.src = dataUrl;
    });
  }

  // One folder per page session so a review lands in a single directory.
  function shotFolder() {
    if (state.shotDir) return state.shotDir;
    var host = (window.location.hostname || "page").replace(/[^A-Za-z0-9.-]/g, "").slice(0, 60) || "page";
    var d = new Date();
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    state.shotDir = "annotate-html/" + host.toLowerCase() + "-" +
      d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    return state.shotDir;
  }

  function shotFileName(num) {
    // Counter-based, not list position: deleting annotations never reuses a
    // file name, so a folder always maps one file to one annotation.
    var n = String(num);
    while (n.length < 2) n = "0" + n;
    return shotFolder() + "/ann-" + n + ".jpg";
  }

  // ═══════════════════════════════════════════
  // Persistence — survive reload, restart, and leaving the page
  // ═══════════════════════════════════════════
  // Two layers:
  //   1. chrome.storage.local, keyed per page, restored on every load. This is
  //      the live state: refresh the tab and the pins come back.
  //   2. a YAML sidecar written next to the screenshots, overwritten in place,
  //      so the feedback is also readable on disk without the tool.
  // Both are extension-only. The plain <script> channel has neither API and
  // keeps behaving exactly as before.
  var STORE_PREFIX = "ann:page:";
  var STORE_INDEX = "ann:index";
  var STORE_MAX_PAGES = 30;
  var STORE_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
  var SAVE_DEBOUNCE = 400;
  var SIDECAR_DEBOUNCE = 2500;

  var saveTimer = null;
  var sidecarTimer = null;
  var sidecarHash = null;

  var storeCache = null;

  // Three channels, one interface: chrome.storage.local when an extension hosts
  // us, GM_* inside a userscript manager, localStorage for a plain <script>.
  // Everything below uses the chrome-shaped callbacks, so the save/restore code
  // does not care which one answered.
  function storageArea() {
    if (storeCache) return storeCache;

    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        storeCache = chrome.storage.local;
        return storeCache;
      }
    } catch (e) { /* not an extension context */ }

    if (typeof GM_getValue === "function" && typeof GM_setValue === "function") {
      storeCache = gmStore();
      return storeCache;
    }

    try {
      if (typeof localStorage !== "undefined") {
        storeCache = localStore();
        return storeCache;
      }
    } catch (e) { /* storage disabled: private mode, sandboxed iframe */ }

    return null;
  }

  // One key holding the whole page map: atomic writes, and no dependence on how
  // many discrete values the userscript manager allows.
  var GM_KEY = "annotate-html:pages";

  function gmReadAll() {
    var raw = GM_getValue(GM_KEY, "{}");
    if (raw && typeof raw === "object") return raw;
    try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
  }

  function gmStore() {
    return {
      get: function (key, cb) {
        var all = gmReadAll();
        var out = {};
        if (all[key] !== undefined) out[key] = all[key];
        setTimeout(function () { cb(out); }, 0);
      },
      set: function (patch) {
        var all = gmReadAll();
        Object.keys(patch).forEach(function (k) { all[k] = patch[k]; });
        GM_setValue(GM_KEY, JSON.stringify(all));
      },
      remove: function (keys) {
        var all = gmReadAll();
        (Array.isArray(keys) ? keys : [keys]).forEach(function (k) { delete all[k]; });
        GM_setValue(GM_KEY, JSON.stringify(all));
      },
    };
  }

  var LS_PREFIX = "annotate-html:";

  function localStore() {
    // Fail fast when storage is blocked rather than pretending the save worked.
    var probe = LS_PREFIX + "probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);

    return {
      get: function (key, cb) {
        var out = {};
        try {
          var raw = localStorage.getItem(LS_PREFIX + key);
          if (raw) out[key] = JSON.parse(raw);
        } catch (e) { /* corrupt entry: behave like a miss */ }
        setTimeout(function () { cb(out); }, 0);
      },
      set: function (patch) {
        Object.keys(patch).forEach(function (k) {
          try { localStorage.setItem(LS_PREFIX + k, JSON.stringify(patch[k])); } catch (e) {}
        });
      },
      remove: function (keys) {
        (Array.isArray(keys) ? keys : [keys]).forEach(function (k) {
          try { localStorage.removeItem(LS_PREFIX + k); } catch (e) {}
        });
      },
    };
  }

  // Query and hash are dropped so SPA route params do not split one page's
  // annotations across buckets. Every annotation still carries the full URL it
  // was taken on, so the packet stays exact.
  function pageKey() {
    return STORE_PREFIX + window.location.origin + window.location.pathname;
  }

  function plainAnnotation(a) {
    var out = {};
    for (var k in a) {
      if (Object.prototype.hasOwnProperty.call(a, k) && k.charAt(0) !== "_") out[k] = a[k];
    }
    return out;
  }

  function snapshot() {
    return {
      v: 1,
      url: window.location.href,
      title: document.title || "",
      ts: Date.now(),
      counter: state.counter,
      markerColor: state.markerColor,
      shotDir: state.shotDir || null,
      annotations: state.annotations.map(plainAnnotation),
    };
  }

  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16);
  }

  function saveNow() {
    var store = storageArea();
    if (!store) return;
    var key = pageKey();

    if (!state.annotations.length) {
      store.remove(key);
      updateIndex(key, null);
      return;
    }

    var snap = snapshot();
    var patch = {};
    patch[key] = snap;
    store.set(patch);
    updateIndex(key, snap.ts);
  }

  // Newest first, capped by count and age. Evicted pages lose their stored
  // annotations only — screenshots on disk are never deleted by a prune.
  function updateIndex(key, ts) {
    var store = storageArea();
    if (!store) return;
    store.get(STORE_INDEX, function (data) {
      var idx = (data && data[STORE_INDEX]) || [];
      var next = idx.filter(function (e) { return e && e.key !== key; });
      if (ts) next.unshift({ key: key, ts: ts });

      var cutoff = Date.now() - STORE_MAX_AGE;
      next = next.filter(function (e) { return e.ts >= cutoff; });
      var dropped = next.slice(STORE_MAX_PAGES);
      next = next.slice(0, STORE_MAX_PAGES);

      var patch = {};
      patch[STORE_INDEX] = next;
      store.set(patch);
      if (dropped.length) store.remove(dropped.map(function (e) { return e.key; }));
    });
  }

  function sidecarName() {
    return shotFolder() + "/annotations.yaml";
  }

  function writeSidecar() {
    if (!extensionRuntime()) return;
    var packet = generateOutput();
    if (!packet) return;

    // generateOutput stamps `generated:` on every call, so hash the annotations
    // rather than the packet: repeated saves with no change write nothing.
    var hash = fnv(JSON.stringify(state.annotations.map(plainAnnotation)) + state.markerColor);
    if (hash === sidecarHash) return;

    sendToExtension({ type: "ann-write-yaml", name: sidecarName(), text: packet })
      .then(function (res) {
        if (res && res.ok) sidecarHash = hash;
      });
  }

  function scheduleSidecar() {
    if (!extensionRuntime()) return;
    clearTimeout(sidecarTimer);
    sidecarTimer = setTimeout(function () {
      sidecarTimer = null;
      writeSidecar();
    }, SIDECAR_DEBOUNCE);
  }

  function scheduleSave() {
    if (!storageArea()) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      saveNow();
    }, SAVE_DEBOUNCE);
    scheduleSidecar();
  }

  // Flush both layers when the page is going away, so the last edit is not lost
  // in a debounce window.
  function flushSave() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; saveNow(); }
    if (sidecarTimer) { clearTimeout(sidecarTimer); sidecarTimer = null; }
    writeSidecar();
  }

  function restoreState() {
    var store = storageArea();
    if (!store) return;
    var key = pageKey();

    store.get(key, function (data) {
      var snap = data && data[key];
      if (!snap || !snap.annotations || !snap.annotations.length) return;
      // A second injection on a page that already restored must not duplicate.
      if (state.annotations.length) return;

      state.annotations = snap.annotations;
      state.counter = Math.max(
        typeof snap.counter === "number" ? snap.counter : 0,
        snap.annotations.length
      );
      // Keep new ids clear of restored ones ("ann-7" etc.).
      state.annotations.forEach(function (a) {
        var m = /^ann-(\d+)$/.exec(a.id || "");
        if (m) state.counter = Math.max(state.counter, parseInt(m[1], 10));
      });
      if (snap.markerColor) {
        state.markerColor = snap.markerColor;
        updateAccentColor(snap.markerColor);
        if (colorSwatch) colorSwatch.style.background = snap.markerColor;
      }
      // Reuse the original shot folder so new screenshots and the sidecar land
      // beside the restored ones instead of starting a second folder.
      state.shotDir = snap.shotDir || null;

      updateCount();
      renderMarkers();
      // Show the page the way it looked when the notes were written.
      state.annotations.forEach(restoreAnnotationDesign);
      showToast("Restored " + snap.annotations.length + " annotation(s)");
    });
  }

  // Fire-and-forget capture: annotations must never block on the screenshot.
  function attachScreenshot(annotation, rect, num) {
    if (!extensionRuntime()) return;
    var shot = { name: shotFileName(num), dataUrl: null, path: null };
    annotation.screenshot = shot;

    annotation._shotPromise = captureViewportShot()
      .then(function (viewportShot) {
        if (!viewportShot) return null;
        return fullShotWithHighlight(viewportShot, rect);
      })
      .then(function (shotDataUrl) {
        if (!shotDataUrl) { annotation.screenshot = null; return null; }
        shot.dataUrl = shotDataUrl;
        return sendToExtension({ type: "ann-save-shot", dataUrl: shotDataUrl, name: shot.name });
      })
      .then(function (saved) {
        if (saved && saved.filename) shot.path = saved.filename;
        renderMarkers();
        scheduleSave();
        return shot.dataUrl ? shot : null;
      })
      .catch(function () {
        annotation.screenshot = null;
        return null;
      });
  }

  // ═══════════════════════════════════════════
  // Output Generation (ported from agentation)
  // ═══════════════════════════════════════════

  // YAML scalar escaping: always double-quote, JSON-style escapes (valid YAML).
  function yamlStr(v) {
    var s = (v === null || typeof v === "undefined") ? "" : String(v);
    var q = "\"";
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === "\\") q += "\\\\";
      else if (c === "\"") q += "\\\"";
      else if (c === "\n") q += "\\n";
      else if (c === "\r") q += "\\r";
      else if (c === "\t") q += "\\t";
      else q += c;
    }
    return q + "\"";
  }

  function generateOutput() {
    if (state.annotations.length === 0) return "";
    var dl = state.detailLevel;
    var pageUrl = window.location.href;
    var L = [];

    // Agent-facing header: what this is, how to read it cheaply, how to decode images.
    L.push("# tea-annotate packet - structured page feedback for AI agents.");
    L.push("# Fork of annotate-html by Asim Sayed (MIT). See FORK-NOTES.md.");
    L.push("# Each entry under `annotations:` is one element-level note from a human reviewer:");
    L.push("# `feedback` says what to change, `xpath`/`location` say exactly where.");
    L.push("# Reading this cheaply: all metadata is above; the ONLY bulk is the `images:`");
    L.push("# block at the very bottom. To skip the base64, read up to the line starting");
    L.push("# with `images:` and ignore everything after it.");
    L.push("# Screenshots are full-viewport JPEGs with the annotated element outlined in red.");
    L.push("# Prefer `screenshot.path` when present - the same JPEG is already on disk.");
    L.push("# To decode an inline image (id N) to a viewable file:");
    L.push("#   awk -v id=N '$0==\"images:\"{p=1;next} p&&$1==id\":\"{sub(/^[^,]*,/,\"\");print;exit}' FILE | base64 -d > shot-N.jpg");
    L.push("# or in Python: after splitting the text on the line `images:`, take the line");
    L.push("#   starting `N: `, cut everything up to the first comma, base64-decode the rest.");
    L.push("#");
    L.push("schema: annotate-html/v1");
    L.push("generated: " + yamlStr(new Date().toISOString()));
    L.push("page:");
    L.push("  url: " + yamlStr(pageUrl));
    if (document.title) L.push("  title: " + yamlStr(document.title));
    L.push("  viewport: " + JSON.stringify(window.innerWidth + "x" + window.innerHeight));
    L.push("annotation_count: " + state.annotations.length);
    L.push("annotations:");

    var images = [];
    state.annotations.forEach(function (a, i) {
      var url = a.url || pageUrl;
      var shotPath = a.screenshot && a.screenshot.path ? a.screenshot.path : "";
      var dataUrl = a.screenshot && a.screenshot.dataUrl ? a.screenshot.dataUrl : "";
      L.push("  - id: " + (i + 1));
      L.push("    element: " + yamlStr(a.element));
      if (dl !== "compact") L.push("    url: " + yamlStr(url));
      if (dl !== "compact") {
        L.push("    location: " + yamlStr(a.elementPath));
        if (a.xpath) L.push("    xpath: " + yamlStr(a.xpath));
      }
      if (dl === "forensic") {
        if (a.fullPath) L.push("    full_dom_path: " + yamlStr(a.fullPath));
        if (a.cssClasses) L.push("    css_classes: " + yamlStr(a.cssClasses));
      } else if (dl === "detailed" && a.cssClasses) {
        L.push("    css_classes: " + yamlStr(a.cssClasses));
      }
      if (a.boundingBox && dl !== "compact") {
        var b = a.boundingBox;
        L.push("    position: {x: " + Math.round(b.x) + ", y: " + Math.round(b.y) +
               ", width: " + Math.round(b.width) + ", height: " + Math.round(b.height) + "}");
      }
      if (a.selectedText) L.push("    selected_text: " + yamlStr(a.selectedText));
      if (a.nearbyText && !a.selectedText && dl !== "compact") {
        L.push("    context: " + yamlStr(a.nearbyText.slice(0, 100)));
      }
      if (dl === "forensic") {
        if (a.computedStyles) L.push("    computed_styles: " + yamlStr(a.computedStyles));
        if (a.accessibility) L.push("    accessibility: " + yamlStr(a.accessibility));
      }
      // A design change is the point of the note, so it prints at every detail
      // level, not just forensic.
      if (a.design && Object.keys(a.design).length) {
        L.push("    design:");
        Object.keys(a.design).forEach(function (prop) {
          L.push("      - property: " + yamlStr(cssPropName(prop)));
          L.push("        from: " + yamlStr(String(a.design[prop].from)));
          L.push("        to: " + yamlStr(String(a.design[prop].to)));
        });
      }
      L.push("    feedback: " + yamlStr(a.comment));
      if (shotPath || dataUrl) {
        L.push("    screenshot:");
        if (shotPath) L.push("      path: " + yamlStr(shotPath));
        if (dataUrl) {
          var kb = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 3 / 4 / 1024);
          L.push("      kb: " + kb);
          images.push("  " + (i + 1) + ": " + dataUrl);
        }
      }
    });

    if (images.length) {
      L.push("");
      L.push("images:");
      L = L.concat(images);
    }

    return L.join("\n");
  }

  // ═══════════════════════════════════════════
  // UI — Styles (injected once)
  // ═══════════════════════════════════════════

  function injectStyles() {
    if (document.getElementById("annotate-js-styles")) return;
    var style = document.createElement("style");
    style.id = "annotate-js-styles";
    style.textContent = [
      // Palette — warm dark ramp (roasted tea) and one hojicha-gold accent.
      // Depth comes from surface steps and hairlines, never gradients; gold is
      // reserved for the pin, the active state and focus, so the cream primary
      // action stays the strongest thing in the popup.
      // --ann-bg:        #191310  surface (toolbar, popup, tip)
      // --ann-bg-alt:    #221A15  recessed (inputs, style block)
      // --ann-bg-hover:  #2B211A  hover surface
      // --ann-ink:       #F2EADB  primary text, cream
      // --ann-ink-soft:  #B6A896  secondary text
      // --ann-ink-mute:  #8C8071  tertiary text, placeholder
      // --ann-line:      rgba(242,234,219,.10) hairline
      // --ann-accent:    #D9A441  gold: pins, active, focus
      // --ann-accent-dk: #B98429  pressed gold
      // --ann-accent-bg: rgba(217,164,65,.10)

      // Toolbar
      '#ann-toolbar{position:fixed;bottom:24px;right:24px;z-index:99999;',
      'font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;',
      '-webkit-font-smoothing:antialiased;font-feature-settings:"ss01","cv11";',
      'font-size:13px;display:flex;align-items:center;gap:4px;',
      'background:#191310;color:#F2EADB;padding:6px;border-radius:14px;',
      'height:44px;max-width:600px;overflow:hidden;',
      'border:1px solid rgba(242,234,219,0.14);',
      'box-shadow:0 1px 2px rgba(6,4,2,0.14),0 10px 28px rgba(6,4,2,0.34);',
      'transition:max-width .36s cubic-bezier(.65,0,.35,1),',
      'padding .36s cubic-bezier(.65,0,.35,1),',
      'border-radius .36s cubic-bezier(.65,0,.35,1),',
      'box-shadow .25s ease;',
      'user-select:none;cursor:grab}',
      '#ann-toolbar.ann-dragging,#ann-toolbar.ann-dragging *{cursor:grabbing !important}',

      // Collapsed (round button) state — same element morphs
      '#ann-toolbar.collapsed{max-width:44px;padding:0;border-radius:50%;',
      'overflow:visible;justify-content:center;cursor:grab;',
      'box-shadow:0 1px 2px rgba(6,4,2,0.10),0 6px 18px rgba(6,4,2,0.24)}',
      '@media (hover:hover){#ann-toolbar.collapsed:hover{',
      'box-shadow:0 2px 4px rgba(6,4,2,0.14),0 10px 28px rgba(6,4,2,0.34)}}',

      // Children fade — fast out on collapse, delayed in on expand
      '#ann-toolbar > *:not(.ann-collapsed-view){',
      'opacity:1;transition:opacity .15s ease .22s}',
      '#ann-toolbar.collapsed > *:not(.ann-collapsed-view){',
      'opacity:0;pointer-events:none;transition:opacity .12s ease 0s}',

      // The collapsed face — pencil icon + badge, sits absolute over the row
      '.ann-collapsed-view{position:absolute;inset:0;display:flex;align-items:center;',
      'justify-content:center;color:#D9A441;pointer-events:none;opacity:0;',
      'transition:opacity .14s ease 0s}',
      '#ann-toolbar.collapsed .ann-collapsed-view{opacity:1;pointer-events:auto;',
      'transition:opacity .14s ease .22s}',
      '.ann-collapsed-view svg{width:18px;height:18px;display:block}',
      '.ann-collapsed-view .ann-collapsed-badge{position:absolute;top:-4px;right:-4px;',
      'background:#D9A441;color:#191310;border:1.5px solid #F2EADB;',
      'border-radius:100px;min-width:17px;height:17px;padding:0 4px;',
      'font-size:10px;font-weight:600;font-variant-numeric:tabular-nums;',
      'display:flex;align-items:center;justify-content:center;line-height:1;',
      'pointer-events:none;transform-origin:center;',
      'transition:transform .2s cubic-bezier(.2,.8,.2,1)}',
      '.ann-collapsed-view .ann-collapsed-badge.empty{display:none}',
      '.ann-collapsed-view .ann-collapsed-badge.bump{animation:ann-badge-pop .35s cubic-bezier(.2,.8,.2,1)}',


      '#ann-toolbar button{background:none;border:none;color:#F2EADB;cursor:pointer;',
      'padding:7px 10px;border-radius:9px;font-size:13px;font-weight:500;font-family:inherit;',
      'transition:background .15s ease,color .15s ease,transform .1s ease;',
      'display:inline-flex;align-items:center;gap:6px;white-space:nowrap;line-height:1}',
      '#ann-toolbar button svg{width:18px;height:18px;flex-shrink:0;display:block}',
      '@media (hover:hover){#ann-toolbar button:hover{background:#2B211A;color:#F2EADB}}',
      '#ann-toolbar button:active{transform:scale(.97)}',
      '#ann-toolbar button.active{background:rgba(217,164,65,.10);color:#D9A441}',
      '#ann-toolbar button.icon-only{padding:7px}',

      // Eye-toggle button with corner badge
      '#ann-toolbar .ann-eye-btn{position:relative}',
      '#ann-toolbar .ann-eye-badge{position:absolute;top:-3px;right:-3px;',
      'background:#D9A441;color:#191310;border:1.5px solid #F2EADB;',
      'border-radius:100px;min-width:17px;height:17px;padding:0 4px;',
      'font-size:10px;font-weight:600;font-variant-numeric:tabular-nums;',
      'display:flex;align-items:center;justify-content:center;line-height:1;',
      'pointer-events:none;transform-origin:center;',
      'transition:transform .2s cubic-bezier(.2,.8,.2,1)}',
      '#ann-toolbar .ann-eye-badge.empty{display:none}',
      '#ann-toolbar .ann-eye-btn.hidden-state{color:#8C8071}',
      // pop on increment
      '@keyframes ann-badge-pop{0%{transform:scale(1)}40%{transform:scale(1.25)}100%{transform:scale(1)}}',
      '#ann-toolbar .ann-eye-badge.bump{animation:ann-badge-pop .35s cubic-bezier(.2,.8,.2,1)}',

      // Copy success state
      '#ann-toolbar button.success{background:rgba(34,165,90,.10)}',
      '#ann-toolbar button.success svg{color:inherit}',

      // Color swatch (toolbar circle)
      '#ann-toolbar .ann-color-swatch{width:22px;height:22px;border-radius:50%;cursor:pointer;',
      'border:2px solid rgba(242,234,219,0.10);flex-shrink:0;',
      'transition:transform .15s ease,border-color .15s ease}',
      '@media (hover:hover){#ann-toolbar .ann-color-swatch:hover{transform:scale(1.1);',
      'border-color:rgba(242,234,219,0.25)}}',
      '#ann-toolbar .ann-color-swatch:active{transform:scale(.95)}',

      // Color picker popover
      '#ann-color-picker{position:fixed;z-index:99998;',
      'background:#191310;border:1px solid rgba(242,234,219,0.10);',
      'border-radius:12px;padding:10px 14px;',
      'box-shadow:0 1px 2px rgba(6,4,2,0.10),0 12px 32px rgba(6,4,2,0.34);',
      'display:flex;gap:8px;align-items:center;',
      'animation:ann-popup-in .2s cubic-bezier(.2,.8,.2,1) both}',
      '.ann-color-opt{width:28px;height:28px;border-radius:50%;cursor:pointer;',
      'flex-shrink:0;border:none;padding:0;',
      'transition:transform .12s ease}',
      '@media (hover:hover){.ann-color-opt:hover{transform:scale(1.15)}}',
      '.ann-color-opt:active{transform:scale(.92)}',
      '.ann-color-opt.active{box-shadow:0 0 0 2px #191310,0 0 0 3.5px #F2EADB}',

      // Custom toolbar tooltip (pops above)
      '#ann-tip{position:fixed;z-index:100000;',
      'background:#191310;border:1px solid rgba(242,234,219,0.10);',
      'border-radius:8px;padding:5px 10px;',
      'box-shadow:0 2px 12px rgba(6,4,2,0.29);',
      'font-family:ui-sans-serif,-apple-system,system-ui,sans-serif;',
      '-webkit-font-smoothing:antialiased;',
      'font-size:12px;font-weight:500;color:#F2EADB;',
      'white-space:nowrap;pointer-events:none;',
      'opacity:0;transform:translateX(-50%) translateY(4px);',
      'transition:opacity .1s ease,transform .1s ease}',
      '#ann-tip.show{opacity:1;transform:translateX(-50%) translateY(0)}',
      '#ann-tip .ann-tip-key{color:#B6A896;margin-left:6px;font-size:11px;font-weight:400}',
      "#ann-tip::after{content:'';position:absolute;bottom:-5px;left:50%;",
      'transform:translateX(-50%);',
      'border-left:5px solid transparent;border-right:5px solid transparent;',
      'border-top:5px solid #191310}',

      '#ann-toolbar .ann-divider{width:1px;height:18px;background:rgba(242,234,219,0.10);margin:0 2px}',

      '#ann-toolbar select{appearance:none;-webkit-appearance:none;-moz-appearance:none;',
      'background-color:#221A15;',
      'background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%238C8071\' stroke-width=\'2.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><path d=\'m6 9 6 6 6-6\'/></svg>");',
      'background-repeat:no-repeat;background-position:right 9px center;',
      'border:1px solid rgba(242,234,219,0.10);',
      'color:#F2EADB;border-radius:8px;padding:5px 26px 5px 10px;',
      'font-size:12px;font-weight:500;line-height:1.4;',
      'font-family:inherit;cursor:pointer;transition:border-color .15s ease}',
      '#ann-toolbar select:hover{border-color:rgba(242,234,219,0.18)}',
      '#ann-toolbar select:focus{outline:none;border-color:#D9A441}',
      '#ann-toolbar select::-ms-expand{display:none}',

      // Hover highlight
      '#ann-hover-highlight{position:fixed;z-index:99990;pointer-events:none;',
      'border:1.5px solid #D9A441;border-radius:4px;',
      'background:rgba(217,164,65,.04);',
      'transition:all .12s cubic-bezier(.2,.8,.2,1)}',

      // Hover label
      '#ann-hover-label{position:fixed;z-index:99991;pointer-events:none;',
      'background:#F2EADB;color:#191310;',
      'padding:5px 10px;border-radius:7px;font-size:11px;font-weight:500;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
      'white-space:nowrap;box-shadow:0 4px 16px rgba(6,4,2,0.43)}',

      // Markers — outer wrapper handles position + entry pop only (no visual)
      '.ann-marker{position:absolute;z-index:99992;width:24px;height:24px;',
      'cursor:pointer;overflow:visible;',
      'transform:translate(-50%,-50%);',
      'animation:ann-pop .3s cubic-bezier(.2,.8,.2,1) backwards}',
      // Inner circle — the actual visible pin, scales on hover
      '.ann-marker-circle{cursor:pointer;width:24px;height:24px;border-radius:50%;',
      'background:#D9A441;color:#191310;',
      'font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;',
      'display:flex;align-items:center;justify-content:center;',
      'border:2px solid #F2EADB;box-sizing:border-box;',
      'box-shadow:0 1px 2px rgba(6,4,2,0.24),0 4px 12px rgba(217,164,65,.30);',
      'font-family:ui-sans-serif,-apple-system,system-ui,sans-serif;',
      'transform-origin:center;',
      'transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s ease}',
      '.ann-marker .ann-marker-num,.ann-marker .ann-marker-edit{',
      'display:flex;align-items:center;justify-content:center;line-height:1}',
      '.ann-marker .ann-marker-edit{display:none}',
      '.ann-marker .ann-marker-edit svg{width:13px;height:13px;display:block}',
      '@media (hover:hover){.ann-marker:hover .ann-marker-circle{',
      'transform:scale(1.3);',
      'box-shadow:0 2px 4px rgba(6,4,2,0.29),0 8px 22px rgba(217,164,65,.42)}',
      '.ann-marker:hover .ann-marker-num{display:none}',
      '.ann-marker:hover .ann-marker-edit{display:flex}}',
      '@keyframes ann-pop{from{transform:translate(-50%,-50%) scale(.8);opacity:0}',
      'to{transform:translate(-50%,-50%) scale(1);opacity:1}}',

      // Marker tooltip
      '.ann-marker-tip{position:absolute;left:30px;top:50%;transform:translateY(-50%);',
      'background:#191310;color:#F2EADB;',
      'padding:10px 12px;border-radius:10px;font-size:12px;min-width:200px;max-width:320px;',
      'border:1px solid rgba(242,234,219,0.10);',
      'box-shadow:0 1px 2px rgba(6,4,2,0.10),0 12px 32px rgba(6,4,2,0.34);',
      'pointer-events:none;white-space:normal;line-height:1.5;text-wrap:pretty;',
      'opacity:0;transition:opacity .15s}',
      '.ann-marker:hover .ann-marker-tip{opacity:1}',
      '.ann-marker-tip .ann-tip-element{color:#C2B5A2;font-size:11.5px;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
      'display:block;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ann-marker-tip .ann-tip-comment{color:#F2EADB;font-size:12px;line-height:1.5}',
      '.ann-marker-tip .ann-marker-shot{display:block;width:100%;max-height:120px;',
      'object-fit:cover;object-position:left top;border-radius:6px;',
      'border:1px solid rgba(242,234,219,0.10);margin-bottom:6px}',

      // Popup (comment input)
      '#ann-popup{position:fixed;z-index:99998;background:#191310;',
      'border:1px solid rgba(242,234,219,0.10);',
      'border-radius:14px;padding:18px;min-width:320px;max-width:400px;',
      'box-shadow:0 1px 2px rgba(6,4,2,0.10),0 16px 48px rgba(6,4,2,0.38);',
      'font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;',
      '-webkit-font-smoothing:antialiased;',
      'animation:ann-popup-in .2s cubic-bezier(.2,.8,.2,1) both}',
      '@keyframes ann-popup-in{from{transform:translateY(4px) scale(.98);opacity:0}',
      'to{transform:translateY(0) scale(1);opacity:1}}',

      // Header — inline chevron + element name
      '#ann-popup .ann-popup-header{display:flex;align-items:center;gap:5px;',
      'margin-bottom:8px;cursor:pointer;user-select:none}',
      '#ann-popup .ann-popup-chevron{color:#B6A896;flex-shrink:0;',
      'width:14px;height:14px;display:block;',
      'transition:transform .15s ease;transform:rotate(-90deg)}',
      '#ann-popup .ann-popup-header.expanded .ann-popup-chevron{transform:rotate(0deg)}',
      '#ann-popup .ann-popup-label{color:#F2EADB;font-size:13px;font-weight:400;',
      'font-family:ui-sans-serif,-apple-system,system-ui,sans-serif;',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',

      // Screenshot thumbnail (captured when the annotation was added)
      '#ann-popup .ann-popup-shot{display:block;width:100%;max-height:180px;',
      'object-fit:cover;object-position:left top;border-radius:8px;',
      'border:1px solid rgba(242,234,219,0.10);margin-bottom:10px}',

      // Computed styles block (shown when header expanded)
      '#ann-popup .ann-popup-styles{display:none;',
      'background:#221A15;border:1px solid rgba(242,234,219,0.10);',
      'border-radius:8px;padding:10px 12px;margin-bottom:12px;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
      'font-size:12px;line-height:1.7;word-break:break-word}',
      '#ann-popup .ann-popup-header.expanded ~ .ann-popup-styles{display:block}',
      '#ann-popup .ann-popup-styles .ann-prop{color:#D9A441}',
      '#ann-popup .ann-popup-styles .ann-val{color:#F2EADB}',

      '#ann-popup textarea{width:100%;background:#221A15;border:1px solid rgba(242,234,219,0.10);',
      'color:#F2EADB;border-radius:9px;padding:10px 12px;font-size:13px;',
      'font-family:inherit;-webkit-font-smoothing:antialiased;',
      'resize:vertical;min-height:64px;outline:none;line-height:1.55;',
      'transition:border-color .15s ease,background .15s ease}',

      // Composer tabs: Note | Design
      '#ann-popup .ann-tabs{display:flex;gap:2px;margin:0 0 12px;',
      'border-bottom:1px solid rgba(242,234,219,0.10)}',
      '#ann-popup .ann-tab{background:none;border:none;border-radius:7px 7px 0 0;color:#7E7264;font:inherit;',
      'font-size:12px;font-weight:600;padding:6px 10px 8px;cursor:pointer;position:relative}',
      '#ann-popup .ann-tab:hover{color:#B6A896}',
      '#ann-popup .ann-tab.active{color:#F2EADB;background:rgba(242,234,219,0.07)}',
      '#ann-popup .ann-tab.active::after{content:"";position:absolute;left:8px;right:8px;bottom:-1px;',
      'height:2px;background:#D9A441;border-radius:2px}',
      '#ann-popup .ann-tab .ann-tab-count{color:#D9A441;background:rgba(217,164,65,0.16);',
      'border-radius:999px;padding:0 5px;margin-left:5px;font-size:10.5px;font-variant-numeric:tabular-nums}',

      // Design rows: label, minus, value, plus
      '#ann-popup .ann-design{display:flex;flex-direction:column;gap:9px}',
      '#ann-popup .ann-drow{display:grid;grid-template-columns:1fr 24px 64px 24px;align-items:center;gap:6px}',
      '#ann-popup .ann-drow.wide{grid-template-columns:1fr 124px}',
      '#ann-popup .ann-dlabel{font-size:12px;color:#C2B5A2;white-space:nowrap;overflow:hidden;',
      'text-overflow:ellipsis}',
      '#ann-popup .ann-drow.changed .ann-dlabel{color:#F2EADB}',
      '#ann-popup .ann-dval{box-sizing:border-box;height:24px;display:flex;align-items:center;justify-content:center;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;',
      'color:#F2EADB;text-align:center;font-variant-numeric:tabular-nums;background:#221A15;',
      'border:1px solid rgba(242,234,219,0.20);border-radius:7px;padding:4px 6px;cursor:ns-resize;',
      'user-select:none}',
      '#ann-popup .ann-dval:focus{outline:none;border-color:#D9A441}',
      '#ann-popup .ann-dbtn{box-sizing:border-box;width:24px;height:24px;padding:0;display:flex;align-items:center;',
      'justify-content:center;background:#221A15;border:1px solid rgba(242,234,219,0.20);',
      'border-radius:7px;color:#F2EADB;cursor:pointer;font-size:14px;line-height:1}',
      '#ann-popup .ann-dbtn:hover{background:#2B211A}',
      '#ann-popup .ann-drow input[type=color]{box-sizing:border-box;width:100%;height:24px;padding:2px;',
      'border:1px solid rgba(242,234,219,0.10);border-radius:7px;background:#221A15;cursor:pointer}',
      '#ann-popup .ann-drow input[type=color]::-webkit-color-swatch{border:none;border-radius:5px}',
      '#ann-popup .ann-drow input[type=color]::-webkit-color-swatch-wrapper{padding:0}',
      '#ann-popup .ann-dhint{font-size:11px;color:#C2B5A2;margin:0 0 6px;line-height:1.45}',
      '#ann-popup .ann-dreset{background:none;border:none;color:#C2B5A2;font:inherit;font-size:11.5px;',
      'padding:2px 0 0;margin-bottom:-2px;cursor:pointer;text-decoration:underline;text-underline-offset:2px;text-align:left}',
      '#ann-popup .ann-dreset:hover{color:#F2EADB}',
      '#ann-popup .ann-dlist{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;',
      'color:#B6A896;margin:0;padding:0 0 4px;list-style:none;line-height:1.6}',

      // Keyboard-selection hint inside the hover label
      '#ann-hover-label .ann-keys{color:#C2B5A2;margin-left:10px;font-size:10.5px;letter-spacing:.02em}',
      '#ann-hover-label .ann-keys b{color:#D9A441;font-weight:600}',
      '#ann-popup textarea::placeholder{color:#8C8071}',
      '#ann-popup textarea:focus{border-color:#D9A441;background:#191310}',

      '#ann-popup .ann-popup-actions{display:flex;gap:8px;margin-top:12px;align-items:center;',
      'justify-content:flex-end}',
      '#ann-popup .ann-popup-actions .ann-spacer{flex:1}',

      '#ann-popup .ann-popup-actions button{background:transparent;border:none;',
      'color:#B6A896;border-radius:9px;padding:8px 16px;font-size:13px;font-weight:500;',
      'cursor:pointer;font-family:inherit;',
      'transition:background .15s,color .15s,transform .1s}',
      '@media (hover:hover){#ann-popup .ann-popup-actions button:hover{color:#F2EADB}}',
      '#ann-popup .ann-popup-actions button:active{transform:scale(.97)}',
      '#ann-popup .ann-popup-actions button.primary{background:#F2EADB;',
      'color:#191310;border-radius:100px;padding:8px 20px}',
      '@media (hover:hover){#ann-popup .ann-popup-actions button.primary:hover{background:#D9A441}}',
      '#ann-popup .ann-popup-actions button.icon-only{padding:7px;color:#B6A896}',
      '#ann-popup .ann-popup-actions button.icon-only svg{width:15px;height:15px;display:block}',
      '@media (hover:hover){#ann-popup .ann-popup-actions button.icon-only:hover{',
      'background:rgba(217,164,65,.10);color:#D9A441}}',

      // Active cursor — gold reticle
      "body.ann-active{cursor:" + cursorSvg("#D9A441") + " !important}",
      'body.ann-active *{cursor:inherit !important}',
      // Override crosshair on the tool's own UI
      'body.ann-active #ann-toolbar{cursor:grab !important}',
      'body.ann-active #ann-toolbar *,',
      'body.ann-active #ann-color-picker,body.ann-active #ann-color-picker *,',
      'body.ann-active #ann-popup,body.ann-active #ann-popup *,',
      'body.ann-active .ann-marker,body.ann-active .ann-marker *{cursor:auto !important}',
      'body.ann-active #ann-ruler-h,body.ann-active #ann-ruler-v{cursor:crosshair !important}',
      'body.ann-active #ann-ruler-corner{cursor:default !important}',
      'body.ann-active #ann-toolbar button,body.ann-active #ann-toolbar .ann-color-swatch,',
      'body.ann-active #ann-color-picker .ann-color-opt,',
      'body.ann-active .ann-collapsed-view,',
      'body.ann-active #ann-popup button,body.ann-active #ann-popup .ann-popup-header,',
      'body.ann-active .ann-marker{cursor:pointer !important}',
      'body.ann-active #ann-popup textarea{cursor:text !important}',
      'body.ann-active .ann-guide-handle{cursor:grab !important}',
      'body.ann-active .ann-guide-handle:active{cursor:grabbing !important}',
      'body.ann-active .ann-guide-close{cursor:pointer !important}',

      // Copied toast
      '#ann-toast{position:fixed;top:24px;left:50%;transform:translateX(-50%) translateY(-12px);',
      'z-index:99999;background:#F2EADB;color:#191310;padding:10px 18px;',
      'border-radius:100px;font-size:13px;font-weight:500;',
      'font-family:ui-sans-serif,-apple-system,system-ui,sans-serif;',
      '-webkit-font-smoothing:antialiased;',
      'box-shadow:0 1px 2px rgba(6,4,2,0.24),0 12px 32px rgba(6,4,2,0.58);',
      'opacity:0;transition:all .25s cubic-bezier(.2,.8,.2,1);pointer-events:none;',
      'display:inline-flex;align-items:center;gap:8px}',
      '#ann-toast svg{width:14px;height:14px;color:#D9A441}',
      '#ann-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}',

      // Rulers — hidden by default, slide in on edge hover
      // Base state defines EXIT transition (short, ease-in — subtle retreat)
      '#ann-ruler-h,#ann-ruler-v{position:fixed;z-index:99988;',
      'background:rgba(250,249,245,.92);backdrop-filter:blur(6px);',
      'cursor:crosshair;pointer-events:none;',
      'opacity:0;transition:opacity .15s ease-in,transform .15s ease-in}',
      '#ann-ruler-h{top:0;left:19px;right:0;height:20px;',
      'border-bottom:1px solid rgba(242,234,219,0.10);',
      'transform:translateY(-100%)}',
      '#ann-ruler-v{top:19px;left:0;bottom:0;width:20px;',
      'border-right:1px solid rgba(242,234,219,0.10);',
      'transform:translateX(-100%)}',
      '#ann-ruler-corner{position:fixed;z-index:99989;top:0;left:0;width:20px;height:20px;',
      'background:rgba(250,249,245,.92);backdrop-filter:blur(6px);',
      'border-right:1px solid rgba(242,234,219,0.10);',
      'border-bottom:1px solid rgba(242,234,219,0.10);',
      'pointer-events:none;opacity:0;transform:scale(.9);',
      'transition:opacity .15s ease-in,transform .15s ease-in}',
      // Show state defines ENTER transition (longer, bouncy easing — confident slide-in)
      '#ann-ruler-h.ann-ruler-show{opacity:1;transform:translateY(0);pointer-events:auto;',
      'transition:opacity .3s cubic-bezier(.2,.8,.2,1),transform .3s cubic-bezier(.2,.8,.2,1)}',
      '#ann-ruler-v.ann-ruler-show{opacity:1;transform:translateX(0);pointer-events:auto;',
      'transition:opacity .3s cubic-bezier(.2,.8,.2,1),transform .3s cubic-bezier(.2,.8,.2,1)}',
      '#ann-ruler-corner.ann-ruler-show{opacity:1;transform:scale(1);pointer-events:auto;',
      'transition:opacity .3s cubic-bezier(.2,.8,.2,1),transform .3s cubic-bezier(.2,.8,.2,1)}',
      '#ann-ruler-h canvas,#ann-ruler-v canvas{display:block}',

      // Guide lines (dropped from rulers)
      '.ann-guide{position:fixed;z-index:99987;pointer-events:auto}',
      '.ann-guide-h{left:0;right:0;height:0;padding:4px 0;border-top:1px solid;',
      'cursor:ns-resize;background:none !important;box-sizing:content-box}',
      '.ann-guide-v{top:0;bottom:0;width:0;padding:0 4px;border-left:1px solid;',
      'cursor:ew-resize;background:none !important;box-sizing:content-box}',
      // Guide handle (drag affordance + label + close)
      '.ann-guide-handle{position:absolute;display:flex;align-items:center;gap:2px;',
      'background:#191310;border:1px solid rgba(242,234,219,0.10);',
      'border-radius:6px;padding:3px 3px 3px 8px;',
      'box-shadow:0 1px 6px rgba(6,4,2,0.24);',
      'cursor:grab;user-select:none;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
      'font-size:10px;font-weight:500;color:#F2EADB;white-space:nowrap;',
      'font-variant-numeric:tabular-nums;',
      'opacity:0;transition:opacity .15s ease}',
      '.ann-guide:hover .ann-guide-handle,.ann-guide-handle.dragging{opacity:1}',
      '.ann-guide-handle:active{cursor:grabbing}',
      '.ann-guide-h .ann-guide-handle{left:24px;top:50%;transform:translateY(-50%)}',
      '.ann-guide-v .ann-guide-handle{top:24px;left:50%;transform:translateX(-50%)}',
      '.ann-guide-close{background:none;border:none;color:#B6A896;cursor:pointer;',
      'padding:2px;border-radius:4px;display:flex;align-items:center;justify-content:center;',
      'transition:color .12s,background .12s}',
      '@media (hover:hover){.ann-guide-close:hover{background:rgba(242,234,219,0.10);color:#F2EADB}}',
      '.ann-guide-close svg{width:12px;height:12px;display:block}',
      // Wider invisible hit area on the line itself
      '.ann-guide::before{content:"";position:absolute}',
      '.ann-guide-h::before{left:0;right:0;top:-4px;bottom:-4px}',
      '.ann-guide-v::before{top:0;bottom:0;left:-4px;right:-4px}',

      // Reduced motion
      '@media (prefers-reduced-motion:reduce){',
      '#ann-toolbar,#ann-popup,#ann-toast,.ann-marker,#ann-hover-highlight,',
      '#ann-ruler-h,#ann-ruler-v,#ann-ruler-corner{',
      'transition:none !important;animation:none !important}}',

      // Overlay root. Everything that floats lives here, and the whole root goes
      // into the browser's top layer via the popover API, so application chrome
      // (fixed sidebars, drawers, CDK overlays, anything with a bigger z-index or
      // a transform ancestor) cannot paint over the toolbar, the hover highlight
      // or the popup. z-index is only the fallback for browsers without popover.
      '#ann-root{position:fixed;inset:0;margin:0;padding:0;border:0;background:transparent;',
      'width:100vw;height:100vh;max-width:none;max-height:none;overflow:visible;',
      'pointer-events:none;color:inherit;z-index:2147483000}',
      // The root itself must not swallow clicks; its widgets opt back in.
      // Only the widgets that take input opt back in, by id: a universal rule
      // out-ranks the pointer-events:none that the collapsed face relies on and
      // turns an invisible overlay into a click trap.
      '#ann-root > #ann-toolbar,#ann-root > #ann-popup,#ann-root > #ann-color-picker{pointer-events:auto}',
      '#ann-root #ann-hover-highlight,#ann-root #ann-hover-label,',
      '#ann-root #ann-toast,#ann-root #ann-tip,#ann-root .ann-preview,',
      '#ann-root .ann-shot-preview{pointer-events:none !important}',

      // Marker layer stays in normal flow coordinates (page-absolute), so it is
      // mounted outside the root; it still gets the top z-index it can have.
      '#ann-markers{z-index:2147482999}',
    ].join("\n");
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════
  // UI — DOM helpers
  // ═══════════════════════════════════════════

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "className") e.className = attrs[k];
      else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    if (children) {
      if (typeof children === "string") e.textContent = children;
      else if (Array.isArray(children)) children.forEach(function (c) { if (c) e.appendChild(c); });
      else e.appendChild(children);
    }
    return e;
  }

  // ═══════════════════════════════════════════
  // Overlay root — the top layer
  // ═══════════════════════════════════════════
  // A fixed overlay loses to application chrome whenever the app gives a fixed
  // sidebar a bigger z-index, drops it in a later stacking context, or opens a
  // modal <dialog>. The popover API lifts our root into the browser's top layer,
  // which beats all of that without editing the host application's CSS. Browsers
  // without popover keep the old behaviour with a maximal z-index.
  var rootEl = null;

  function overlayRoot() {
    if (rootEl && rootEl.isConnected) return rootEl;

    rootEl = el("div", { id: "ann-root" });
    rootEl.setAttribute("popover", "manual");
    rootEl.style.pointerEvents = "none";
    document.documentElement.appendChild(rootEl);

    // "manual" popovers ignore Escape and light dismissal, so a stray click in
    // the page cannot close the tool out from under the user.
    if (typeof rootEl.showPopover === "function") {
      try { rootEl.showPopover(); } catch (e) { /* already open */ }
    }
    return rootEl;
  }

  // Floating widgets live inside the root. The marker layer does not: its
  // children carry page-absolute coordinates, so it stays a body child.
  function mount(node) {
    overlayRoot().appendChild(node);
    return node;
  }

  // ═══════════════════════════════════════════
  // Icons (Lucide — ISC license, inlined for zero-dep)
  // ═══════════════════════════════════════════

  var ICON_ATTRS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  var ICONS = {
    // square-pen (toolbar Annotate button + collapsed face)
    pencil: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
      '<path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>' +
      '</svg>',
    // plain pencil (marker hover edit)
    pencilPlain: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>' +
      '<path d="m15 5 4 4"/>' +
      '</svg>',
    // copy
    copy: '<svg ' + ICON_ATTRS + '>' +
      '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>' +
      '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>' +
      '</svg>',
    // download
    download: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
      '<polyline points="7 10 12 15 17 10"/>' +
      '<line x1="12" x2="12" y1="15" y2="3"/>' +
      '</svg>',
    // trash-2
    trash: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M3 6h18"/>' +
      '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
      '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
      '<line x1="10" x2="10" y1="11" y2="17"/>' +
      '<line x1="14" x2="14" y1="11" y2="17"/>' +
      '</svg>',
    // x
    x: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>' +
      '</svg>',
    // check
    check: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M20 6 9 17l-5-5"/>' +
      '</svg>',
    // eye
    eye: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>' +
      '<circle cx="12" cy="12" r="3"/>' +
      '</svg>',
    // eye-off
    eyeOff: '<svg ' + ICON_ATTRS + '>' +
      '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>' +
      '<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>' +
      '<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>' +
      '<path d="m2 2 20 20"/>' +
      '</svg>',
    // chevron-right
    chevronRight: '<svg ' + ICON_ATTRS + '>' +
      '<path d="m9 18 6-6-6-6"/>' +
      '</svg>',
    // chevron-down
    chevronDown: '<svg ' + ICON_ATTRS + '>' +
      '<path d="m6 9 6 6 6-6"/>' +
      '</svg>',
    // check-circle filled (for copy success) — matcha, not stock green
    checkCircleFilled: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10" fill="#8FA96B"/>' +
      '<path d="m8.5 12.5 2.5 2.5 4.5-5" fill="none" stroke="#191310" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>',
  };

  function iconEl(name) {
    var span = document.createElement("span");
    span.innerHTML = ICONS[name];
    return span.firstChild;
  }

  // ═══════════════════════════════════════════
  // UI — Toolbar
  // ═══════════════════════════════════════════

  var toolbar, hoverHighlight, hoverLabel, popup, toast;
  var markersContainer;
  var eyeBtn, eyeIconWrap, eyeBadge, copyBtn;
  var collapsedView, collapsedBadge;
  var colorSwatch, colorPicker;
  var accentSheet;
  var tipEl;

  // A gold reticle. Two passes per shape: a dark rim keeps the cursor legible on
  // pale pages, the accent keeps it on brand. The hotspot is the centre, which is
  // the point a user aims at an element.
  function cursorSvg(hex) {
    var enc = hex.replace("#", "%23");
    var ring =
      "<circle cx='14' cy='14' r='8.5' stroke='%23191310' stroke-width='4' stroke-opacity='.4'/>" +
      "<circle cx='14' cy='14' r='8.5' stroke='" + enc + "' stroke-width='2'/>" +
      "<path d='M14 1.75V4.75M14 23.25V26.25M1.75 14H4.75M23.25 14H26.25' stroke='%23191310' stroke-width='4' stroke-opacity='.4' stroke-linecap='round'/>" +
      "<path d='M14 1.75V4.75M14 23.25V26.25M1.75 14H4.75M23.25 14H26.25' stroke='" + enc + "' stroke-width='2' stroke-linecap='round'/>" +
      "<circle cx='14' cy='14' r='2' fill='" + enc + "'/>";
    return "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none'%3E" + ring + "%3C/svg%3E\") 14 14,crosshair";
  }

  function darkenHex(hex, amt) {
    var r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amt);
    var g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amt);
    var b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amt);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  function updateAccentColor(hex) {
    state.markerColor = hex;
    if (colorSwatch) colorSwatch.style.background = hex;
    scheduleSave();

    if (!accentSheet) {
      accentSheet = document.createElement("style");
      accentSheet.id = "ann-accent-styles";
      document.head.appendChild(accentSheet);
    }

    var bg10 = hex + "1A";   // 10%
    var bg42 = hex + "6B";   // 42%
    var dark = darkenHex(hex, 20);

    accentSheet.textContent = [
      "#ann-toolbar button.active{background:" + bg10 + ";color:" + hex + "}",
      "#ann-toolbar .ann-eye-badge{background:" + hex + "}",
      ".ann-collapsed-view{color:" + hex + "}",
      ".ann-collapsed-view .ann-collapsed-badge{background:" + hex + "}",
      "#ann-popup .ann-popup-label{color:" + hex + "}",
      "#ann-popup .ann-popup-header.expanded .ann-popup-chevron{color:" + hex + "}",
      "#ann-popup textarea:focus{border-color:" + hex + "}",
      "#ann-toast svg{color:" + hex + "}",
      "body.ann-active{cursor:" + cursorSvg(hex) + " !important}",
      "@media (hover:hover){",
      "#ann-popup .ann-popup-actions button.primary:hover{background:" + dark + ";border-color:" + dark + "}",
      "#ann-popup .ann-popup-actions button.icon-only:hover{background:" + bg10 + ";color:" + hex + "}",
      ".ann-marker:hover .ann-marker-circle{box-shadow:0 2px 4px rgba(6,4,2,0.29),0 8px 22px " + bg42 + "}}",
    ].join("\n");

    renderMarkers();
  }

  function addTip(target, text, key) {
    target.addEventListener("mouseenter", function () {
      if (!tipEl) return;
      tipEl.innerHTML = escHtml(text) + (key ? '<span class="ann-tip-key">' + escHtml(key) + '</span>' : "");
      var r = target.getBoundingClientRect();
      tipEl.style.left = (r.left + r.width / 2) + "px";
      tipEl.style.top = (r.top - 8) + "px";
      tipEl.style.bottom = "auto";
      // Anchor bottom of tooltip to that top value
      requestAnimationFrame(function () {
        var th = tipEl.offsetHeight;
        tipEl.style.top = (r.top - 8 - th) + "px";
        tipEl.classList.add("show");
      });
    });
    target.addEventListener("mouseleave", function () {
      if (tipEl) tipEl.classList.remove("show");
    });
  }

  function createToolbar() {
    injectStyles();

    // Hover highlight box
    hoverHighlight = el("div", { id: "ann-hover-highlight" });
    hoverHighlight.style.display = "none";
    mount(hoverHighlight);

    // Hover label
    hoverLabel = el("div", { id: "ann-hover-label" });
    hoverLabel.style.display = "none";
    mount(hoverLabel);

    // Markers container
    markersContainer = el("div", { id: "ann-markers", style: "position:absolute;top:0;left:0;width:0;height:0;overflow:visible;z-index:99992" });
    document.body.appendChild(markersContainer);

    // Toast
    toast = el("div", { id: "ann-toast" });
    toast.appendChild(iconEl("check"));
    toast.appendChild(document.createTextNode("Copied to clipboard"));
    mount(toast);

    // Build toolbar
    toolbar = el("div", { id: "ann-toolbar" });

    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    var altKey = isMac ? "\u2325" : "Alt";

    // Shared tooltip element
    tipEl = el("div", { id: "ann-tip" });
    mount(tipEl);

    // Toggle annotate mode
    var toggleBtn = el("button", {
      onClick: toggleActive
    });
    toggleBtn.id = "ann-toggle-btn";
    toggleBtn.appendChild(iconEl("pencil"));
    toggleBtn.appendChild(document.createTextNode("Annotate"));

    // Color swatch
    colorSwatch = el("div", {
      className: "ann-color-swatch",
      role: "button",
      tabindex: "0",
      "aria-label": "Change marker color"
    });
    colorSwatch.style.background = state.markerColor;
    colorSwatch.addEventListener("click", function (e) { e.stopPropagation(); showColorPicker(); });
    colorSwatch.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showColorPicker(); }
    });

    var divider1 = el("span", { className: "ann-divider" });

    // Eye toggle (markers visibility) with corner count badge
    eyeBtn = el("button", {
      className: "icon-only ann-eye-btn",
      onClick: toggleMarkersVisibility,
      "aria-label": "Show or hide markers"
    });
    eyeIconWrap = el("span", { className: "ann-eye-icon" });
    eyeIconWrap.appendChild(iconEl("eye"));
    eyeBadge = el("span", { className: "ann-eye-badge empty" }, "0");
    eyeBtn.appendChild(eyeIconWrap);
    eyeBtn.appendChild(eyeBadge);

    // Copy
    copyBtn = el("button", {
      className: "icon-only",
      onClick: copyOutput,
      "aria-label": "Copy feedback"
    });
    copyBtn.appendChild(iconEl("copy"));

    // Download the packet as a YAML file
    var downloadBtn = el("button", {
      className: "icon-only",
      onClick: downloadOutput,
      "aria-label": "Download YAML"
    });
    downloadBtn.appendChild(iconEl("download"));

    // Clear all
    var clearBtn = el("button", {
      className: "icon-only",
      onClick: clearAll,
      "aria-label": "Clear all"
    });
    clearBtn.appendChild(iconEl("trash"));

    var divider3 = el("span", { className: "ann-divider" });

    // Close (collapse toolbar)
    var closeBtn = el("button", {
      className: "icon-only",
      onClick: hideToolbar,
      "aria-label": "Close"
    });
    closeBtn.appendChild(iconEl("x"));

    var toggleKey = (isMac ? "\u2325" : "Alt") + "A";
    var extKey = isMac ? "\u2325\u21E7A" : "Alt+Shift+A";
    addTip(toggleBtn, "Toggle mode", toggleKey);
    addTip(colorSwatch, "Marker color", "M");
    addTip(eyeBtn, "Show/hide markers", "H");
    addTip(copyBtn, "Copy YAML", "C");
    addTip(downloadBtn, "Download YAML", "D");
    addTip(clearBtn, "Clear all");
    addTip(closeBtn, "Close", extKey);

    toolbar.appendChild(toggleBtn);
    toolbar.appendChild(colorSwatch);
    toolbar.appendChild(divider1);
    toolbar.appendChild(eyeBtn);
    toolbar.appendChild(copyBtn);
    toolbar.appendChild(downloadBtn);
    toolbar.appendChild(clearBtn);
    toolbar.appendChild(divider3);
    toolbar.appendChild(closeBtn);

    // Collapsed face — overlay sibling that's revealed when toolbar morphs to round
    collapsedView = el("div", {
      className: "ann-collapsed-view",
      role: "button",
      tabindex: "0",
      title: "Open annotate-html (" + altKey + "+A)",
      "aria-label": "Open annotate toolbar"
    });
    collapsedView.appendChild(iconEl("pencil"));
    collapsedBadge = el("span", { className: "ann-collapsed-badge empty" }, "0");
    collapsedView.appendChild(collapsedBadge);
    collapsedView.addEventListener("click", showToolbar);
    collapsedView.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showToolbar(); }
    });
    toolbar.appendChild(collapsedView);

    mount(toolbar);

    // Make toolbar draggable
    initToolbarDrag();

    // Create rulers (visible when annotation mode is active)
    createRulers();
  }

  // ═══════════════════════════════════════════
  // Toolbar drag
  // ═══════════════════════════════════════════

  function initToolbarDrag() {
    var dragging = false;
    var didDrag = false;
    var startX, startY, origLeft, origTop;

    toolbar.addEventListener("mousedown", function (e) {
      // Only drag from non-interactive surfaces
      var node = e.target;
      while (node && node !== toolbar) {
        var tag = node.tagName;
        if (tag === "BUTTON" || tag === "SELECT" || tag === "TEXTAREA" || tag === "INPUT") return;
        if (node.className && typeof node.className === "string" &&
            node.className.indexOf("ann-color-swatch") !== -1) return;
        node = node.parentElement;
      }

      e.preventDefault();
      dragging = false;
      didDrag = false;
      startX = e.clientX;
      startY = e.clientY;
      var rect = toolbar.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;

      function onMove(ev) {
        var dx = ev.clientX - startX;
        var dy = ev.clientY - startY;
        if (!dragging && Math.abs(dx) + Math.abs(dy) > 3) {
          dragging = true;
          didDrag = true;
          toolbar.classList.add("ann-dragging");
          toolbar.style.bottom = "auto";
          toolbar.style.right = "auto";
        }
        if (dragging) {
          var w = toolbar.offsetWidth;
          var h = toolbar.offsetHeight;
          var l = Math.max(0, Math.min(origLeft + dx, window.innerWidth - w));
          var t = Math.max(0, Math.min(origTop + dy, window.innerHeight - h));
          toolbar.style.left = l + "px";
          toolbar.style.top = t + "px";
        }
      }

      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        toolbar.classList.remove("ann-dragging");
        dragging = false;
        if (didDrag) {
          // Anchor to whichever side the toolbar landed on
          var rect = toolbar.getBoundingClientRect();
          var center = rect.left + rect.width / 2;
          if (center >= window.innerWidth / 2) {
            // Right half — anchor right, expands leftward
            toolbar.style.right = (window.innerWidth - rect.right) + "px";
            toolbar.style.left = "auto";
          }
          // Left half — keep left anchoring, expands rightward

          // Suppress the click that fires after drag
          var suppress = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
          toolbar.addEventListener("click", suppress, true);
          setTimeout(function () { toolbar.removeEventListener("click", suppress, true); }, 0);
        }
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    // Re-clamp after expand/collapse transition or window resize
    toolbar.addEventListener("transitionend", function (e) {
      if (e.propertyName === "max-width") clampToolbar();
    });
  }

  function clampToolbar() {
    if (!toolbar || toolbar.style.top === "") return;
    var rect = toolbar.getBoundingClientRect();
    var anchorsLeft = toolbar.style.left !== "" && toolbar.style.left !== "auto";

    if (anchorsLeft) {
      // Left-anchored — check right overflow
      if (rect.right > window.innerWidth) {
        toolbar.style.left = Math.max(0, window.innerWidth - rect.width) + "px";
      }
    } else {
      // Right-anchored — check left overflow
      if (rect.left < 0) {
        toolbar.style.right = Math.max(0, window.innerWidth - rect.width) + "px";
      }
    }
    if (rect.bottom > window.innerHeight) {
      toolbar.style.top = Math.max(0, window.innerHeight - rect.height) + "px";
    }
    if (rect.top < 0) {
      toolbar.style.top = "0px";
    }
  }

  // ═══════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════

  // ═══════════════════════════════════════════
  // Rulers & Guides
  // ═══════════════════════════════════════════

  var rulerH, rulerV, rulerCorner, rulerHCanvas, rulerVCanvas;
  var guides = [];

  function createRulers() {
    rulerCorner = el("div", { id: "ann-ruler-corner" });
    mount(rulerCorner);

    rulerH = el("div", { id: "ann-ruler-h" });
    rulerHCanvas = document.createElement("canvas");
    rulerHCanvas.height = 20;
    rulerH.appendChild(rulerHCanvas);
    initRulerDrag(rulerH, "v");
    mount(rulerH);

    rulerV = el("div", { id: "ann-ruler-v" });
    rulerVCanvas = document.createElement("canvas");
    rulerVCanvas.width = 20;
    rulerV.appendChild(rulerVCanvas);
    initRulerDrag(rulerV, "h");
    mount(rulerV);

    drawRulers();
  }

  function initRulerDrag(rulerEl, guideDir) {
    var preview = null;

    rulerEl.addEventListener("mousedown", function (e) {
      e.preventDefault();
      state.rulerDragging = true;
      preview = el("div", { className: "ann-guide ann-guide-" + guideDir });
      preview.style.borderColor = state.markerColor;
      preview.style.opacity = "0.5";
      var lbl = el("span", { className: "ann-guide-label" }, "0px");
      preview.appendChild(lbl);
      mount(preview);

      function onMove(ev) {
        if (!preview) return;
        var pos, pagePos;
        if (guideDir === "h") {
          pos = ev.clientY;
          pagePos = pos + window.scrollY;
          preview.style.top = pos + "px";
        } else {
          pos = ev.clientX;
          pagePos = pos + window.scrollX;
          preview.style.left = pos + "px";
        }
        preview.querySelector(".ann-guide-label").textContent = Math.round(pagePos) + "px";
        // If dragged back onto the ruler, dim it
        var onRuler = guideDir === "h" ? ev.clientX < 20 : ev.clientY < 20;
        preview.style.opacity = onRuler ? "0.2" : "0.5";
      }

      function onUp(ev) {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        state.rulerDragging = false;
        if (!preview) return;
        // Check if dropped back on the ruler — cancel
        var onRuler = guideDir === "h" ? ev.clientX < 20 : ev.clientY < 20;
        if (preview.parentNode) preview.parentNode.removeChild(preview);
        preview = null;
        if (onRuler) return;

        var viewPos, pagePos;
        if (guideDir === "h") {
          viewPos = ev.clientY;
          pagePos = viewPos + window.scrollY;
        } else {
          viewPos = ev.clientX;
          pagePos = viewPos + window.scrollX;
        }
        addGuide(guideDir, viewPos, pagePos);
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function drawRulers() {
    if (!rulerHCanvas || !rulerVCanvas) return;
    var dpr = window.devicePixelRatio || 1;
    var w = window.innerWidth - 20;
    var h = window.innerHeight - 20;
    var sx = window.scrollX;
    var sy = window.scrollY;
    var tickColor = "rgba(242,234,219,0.25)";
    var textColor = "rgba(242,234,219,0.50)";

    // Horizontal ruler
    rulerHCanvas.width = w * dpr;
    rulerHCanvas.height = 20 * dpr;
    rulerHCanvas.style.width = w + "px";
    rulerHCanvas.style.height = "20px";
    var ctxH = rulerHCanvas.getContext("2d");
    ctxH.scale(dpr, dpr);
    ctxH.font = "9px ui-monospace,SFMono-Regular,Menlo,monospace";
    ctxH.fillStyle = textColor;
    ctxH.strokeStyle = tickColor;
    ctxH.lineWidth = 0.5;
    var startX = Math.floor(sx / 10) * 10;
    for (var px = startX; px < sx + w; px += 10) {
      var x = px - sx;
      var isMajor = px % 100 === 0;
      var isMid = px % 50 === 0;
      ctxH.beginPath();
      ctxH.moveTo(x + 0.5, 20);
      ctxH.lineTo(x + 0.5, isMajor ? 4 : isMid ? 10 : 14);
      ctxH.stroke();
      if (isMajor) {
        ctxH.fillText(String(px), x + 3, 12);
      }
    }

    // Vertical ruler
    rulerVCanvas.width = 20 * dpr;
    rulerVCanvas.height = h * dpr;
    rulerVCanvas.style.width = "20px";
    rulerVCanvas.style.height = h + "px";
    var ctxV = rulerVCanvas.getContext("2d");
    ctxV.scale(dpr, dpr);
    ctxV.font = "9px ui-monospace,SFMono-Regular,Menlo,monospace";
    ctxV.fillStyle = textColor;
    ctxV.strokeStyle = tickColor;
    ctxV.lineWidth = 0.5;
    var startY = Math.floor(sy / 10) * 10;
    for (var py = startY; py < sy + h; py += 10) {
      var y = py - sy;
      var isMajorY = py % 100 === 0;
      var isMidY = py % 50 === 0;
      ctxV.beginPath();
      ctxV.moveTo(20, y + 0.5);
      ctxV.lineTo(isMajorY ? 4 : isMidY ? 10 : 14, y + 0.5);
      ctxV.stroke();
      if (isMajorY && y >= 10) {
        ctxV.save();
        ctxV.translate(12, y + 3);
        ctxV.rotate(-Math.PI / 2);
        ctxV.fillText(String(py), 0, 0);
        ctxV.restore();
      }
    }
  }

  function addGuide(dir, viewPos, pagePos) {
    var guide = el("div", { className: "ann-guide ann-guide-" + dir });
    guide.style[dir === "h" ? "top" : "left"] = viewPos + "px";
    guide.style.borderColor = state.markerColor;
    guide._pagePos = pagePos;
    guide._dir = dir;

    // Handle: drag affordance + px label + close button
    var handle = el("div", { className: "ann-guide-handle" });
    var label = el("span", {}, String(Math.round(pagePos)) + "px");

    var closeBtn = el("button", { className: "ann-guide-close", "aria-label": "Remove guide" });
    closeBtn.appendChild(iconEl("x"));
    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      removeGuide(guide);
    });

    handle.appendChild(label);
    handle.appendChild(closeBtn);
    guide.appendChild(handle);

    // Drag from handle or line to reposition; drag to ruler edge to remove
    function startDrag(e) {
      e.preventDefault();
      e.stopPropagation();
      handle.classList.add("dragging");
      function onMove(ev) {
        var pos, pp;
        if (dir === "h") {
          pos = ev.clientY;
          pp = pos + window.scrollY;
          guide.style.top = pos + "px";
        } else {
          pos = ev.clientX;
          pp = pos + window.scrollX;
          guide.style.left = pos + "px";
        }
        guide._pagePos = pp;
        label.textContent = Math.round(pp) + "px";
        var onRuler = dir === "h" ? ev.clientX < 20 : ev.clientY < 20;
        guide.style.opacity = onRuler ? "0.3" : "1";
      }
      function onUp(ev) {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        handle.classList.remove("dragging");
        var onRuler = dir === "h" ? ev.clientX < 20 : ev.clientY < 20;
        if (onRuler) { removeGuide(guide); return; }
        guide.style.opacity = "1";
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }

    handle.addEventListener("mousedown", startDrag);
    guide.addEventListener("mousedown", function (e) {
      if (e.target === guide || e.target === guide.querySelector("::before")) startDrag(e);
    });

    mount(guide);
    guides.push(guide);
  }

  function removeGuide(guide) {
    if (guide.parentNode) guide.parentNode.removeChild(guide);
    guides = guides.filter(function (g) { return g !== guide; });
  }

  function updateGuidePositions() {
    guides.forEach(function (g) {
      if (g._dir === "h") {
        g.style.top = (g._pagePos - window.scrollY) + "px";
      } else {
        g.style.left = (g._pagePos - window.scrollX) + "px";
      }
    });
  }

  function clearGuides() {
    guides.forEach(function (g) { if (g.parentNode) g.parentNode.removeChild(g); });
    guides = [];
  }

  // ═══════════════════════════════════════════
  // Ruler edge-hover reveal
  // ═══════════════════════════════════════════

  var RULER_EDGE_PX = 40;
  var rulerTimerH = null, rulerTimerV = null;

  function showRulerAxis(axis) {
    if (state.markersHidden) return;
    if (axis === "h") {
      if (rulerTimerH) { clearTimeout(rulerTimerH); rulerTimerH = null; }
      if (rulerH) rulerH.classList.add("ann-ruler-show");
    } else {
      if (rulerTimerV) { clearTimeout(rulerTimerV); rulerTimerV = null; }
      if (rulerV) rulerV.classList.add("ann-ruler-show");
    }
    if (rulerCorner) rulerCorner.classList.add("ann-ruler-show");
  }

  function hideRulerAxis(axis) {
    if (state.rulerDragging) return;
    if (axis === "h") {
      if (rulerTimerH) return;
      rulerTimerH = setTimeout(function () {
        rulerTimerH = null;
        if (rulerH) rulerH.classList.remove("ann-ruler-show");
        if (rulerCorner && rulerV && !rulerV.classList.contains("ann-ruler-show")) {
          rulerCorner.classList.remove("ann-ruler-show");
        }
      }, 300);
    } else {
      if (rulerTimerV) return;
      rulerTimerV = setTimeout(function () {
        rulerTimerV = null;
        if (rulerV) rulerV.classList.remove("ann-ruler-show");
        if (rulerCorner && rulerH && !rulerH.classList.contains("ann-ruler-show")) {
          rulerCorner.classList.remove("ann-ruler-show");
        }
      }, 300);
    }
  }

  function handleRulerProximity(e) {
    if (!rulerH) return;
    var x = e.clientX, y = e.clientY;
    if (y <= RULER_EDGE_PX) showRulerAxis("h");
    else hideRulerAxis("h");
    if (x <= RULER_EDGE_PX) showRulerAxis("v");
    else hideRulerAxis("v");
  }

  function toggleActive() {
    state.active = !state.active;
    var btn = document.getElementById("ann-toggle-btn");
    if (state.active) {
      btn.classList.add("active");
      document.body.classList.add("ann-active");
    } else {
      btn.classList.remove("active");
      document.body.classList.remove("ann-active");
      hideHover();
      closePopup();
    }
  }

  // camelCase style prop -> CSS property name, for setProperty/removeProperty
  function cssPropName(prop) {
    return String(prop).replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); });
  }

  // Best-effort re-find of the element an annotation was made on.
  function elementForAnnotation(ann) {
    if (!ann || !ann.xpath) return null;
    try {
      var r = document.evaluate(ann.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return r && r.singleNodeValue && r.singleNodeValue.nodeType === 1 ? r.singleNodeValue : null;
    } catch (e) { return null; }
  }

  function hideHover() {
    hoverHighlight.style.display = "none";
    hoverLabel.style.display = "none";
    state.hoveredEl = null;
    navStack.length = 0;
  }

  function hideToolbar() {
    if (!toolbar) return;
    if (state.active) toggleActive();
    closePopup();
    hideHover();
    toolbar.classList.add("collapsed");
    state.toolbarHidden = true;
  }

  function showToolbar() {
    if (!toolbar) return;
    toolbar.classList.remove("collapsed");
    state.toolbarHidden = false;
  }

  function toggleMarkersVisibility() {
    state.markersHidden = !state.markersHidden;
    markersContainer.style.display = state.markersHidden ? "none" : "";
    eyeIconWrap.innerHTML = "";
    eyeIconWrap.appendChild(iconEl(state.markersHidden ? "eyeOff" : "eye"));
    if (state.markersHidden) eyeBtn.classList.add("hidden-state");
    else eyeBtn.classList.remove("hidden-state");
    // Toggle rulers and guides visibility
    if (state.markersHidden) {
      if (rulerH) rulerH.classList.remove("ann-ruler-show");
      if (rulerV) rulerV.classList.remove("ann-ruler-show");
      if (rulerCorner) rulerCorner.classList.remove("ann-ruler-show");
    }
    guides.forEach(function (g) {
      g.style.display = state.markersHidden ? "none" : "";
    });
  }

  function updateCount() {
    if (!eyeBadge) return;
    var n = state.annotations.length;
    var prev = parseInt(eyeBadge.textContent, 10) || 0;

    eyeBadge.textContent = n;
    if (n === 0) eyeBadge.classList.add("empty");
    else eyeBadge.classList.remove("empty");

    if (collapsedBadge) {
      collapsedBadge.textContent = n;
      if (n === 0) collapsedBadge.classList.add("empty");
      else collapsedBadge.classList.remove("empty");
    }

    // Pop on increment
    if (n > prev) {
      eyeBadge.classList.remove("bump");
      void eyeBadge.offsetWidth;
      eyeBadge.classList.add("bump");
      if (collapsedBadge) {
        collapsedBadge.classList.remove("bump");
        void collapsedBadge.offsetWidth;
        collapsedBadge.classList.add("bump");
      }
    }
  }

  function showToast(msg) {
    // Replace text node (preserve the icon SVG child)
    var tn = null;
    for (var i = 0; i < toast.childNodes.length; i++) {
      if (toast.childNodes[i].nodeType === 3) { tn = toast.childNodes[i]; break; }
    }
    if (tn) tn.nodeValue = msg || "Copied to clipboard";
    else toast.appendChild(document.createTextNode(msg || "Copied to clipboard"));
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 1800);
  }

  function flashCopySuccess() {
    if (!copyBtn) return;
    copyBtn.innerHTML = ICONS.checkCircleFilled;
    copyBtn.classList.add("success");
    setTimeout(function () {
      copyBtn.innerHTML = "";
      copyBtn.appendChild(iconEl("copy"));
      copyBtn.classList.remove("success");
    }, 1500);
  }

  function copyOutput() {
    // A screenshot may still be cropping/saving; wait so the packet that
    // lands on the clipboard always carries the image paths.
    var pending = state.annotations
      .map(function (a) { return a._shotPromise; })
      .filter(function (p) { return p && typeof p.then === "function"; });

    function write() {
      var md = generateOutput();
      if (!md) { showToast("No annotations"); return; }
      navigator.clipboard.writeText(md).then(function () {
        flashCopySuccess();
        showToast("Copied " + state.annotations.length + " annotation(s)");
      });
    }

    if (pending.length === 0) { write(); return; }
    Promise.all(pending).then(write, write);
  }

  // ═══════════════════════════════════════════
  // Download the packet
  // ═══════════════════════════════════════════

  // Flat name for channels whose download URL cannot carry a subfolder.
  function packetDownloadName() {
    var d = new Date();
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    var stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    var host = (window.location.hostname || "page").replace(/[^a-z0-9.-]/gi, "-").toLowerCase();
    return "annotations-" + host + "-" + stamp + ".yaml";
  }

  function downloadOutput() {
    if (!state.annotations.length) { showToast("No annotations"); return; }

    // Wait for any in-flight screenshot so the file carries the image paths.
    var pending = state.annotations
      .map(function (a) { return a._shotPromise; })
      .filter(function (p) { return p && typeof p.then === "function"; });

    function write() {
      var packet = generateOutput();
      if (!packet) { showToast("No annotations"); return; }

      // Extension: the worker writes it beside the screenshots and overwrites in
      // place, so clicking download repeatedly cannot stack copies.
      if (extensionRuntime()) {
        sendToExtension({
          type: "ann-write-yaml",
          name: shotFolder() + "/annotations.yaml",
          text: packet
        }).then(function (res) {
          if (res && res.ok) {
            var short = res.filename ? res.filename.split("/").slice(-2).join("/") : "annotations.yaml";
            showToast("Saved " + short);
          } else {
            showToast("Download failed" + (res && res.error ? " · " + res.error : ""));
          }
        });
        return;
      }

      // Userscript manager: GM_download accepts the same Downloads-relative path.
      if (typeof GM_download === "function") {
        try {
          GM_download({
            url: "data:text/yaml;charset=utf-8," + encodeURIComponent(packet),
            name: shotFolder() + "/annotations.yaml",
            saveAs: false,
            onerror: function () { showToast("Download failed"); }
          });
          showToast("Saved annotations.yaml");
          return;
        } catch (e) { /* fall through to the anchor channel */ }
      }

      // Plain page: an object URL on a temporary anchor. The browser flattens the
      // path, so this one gets a self-describing file name instead of a folder.
      try {
        var name = packetDownloadName();
        var url = URL.createObjectURL(new Blob([packet], { type: "text/yaml;charset=utf-8" }));
        var a = el("a", { href: url, download: name });
        a.style.display = "none";
        document.documentElement.appendChild(a);
        a.click();
        setTimeout(function () {
          URL.revokeObjectURL(url);
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 4000);
        showToast("Saved " + name);
      } catch (e) {
        showToast("Download failed");
      }
    }

    if (pending.length === 0) { write(); return; }
    Promise.all(pending).then(write, write);
  }

  function clearAll() {
    if (!state.annotations.length) return;
    // Put the page back: every live design preview this session is undone.
    state.annotations.forEach(revertAnnotationDesign);
    state.annotations = [];
    updateCount();
    renderMarkers();
    sidecarHash = null;

    // Drop the stored record at once rather than waiting out the debounce, so a
    // reload right after clearing cannot bring the annotations back.
    saveNow();

    if (!extensionRuntime()) {
      showToast("Cleared all annotations");
      return;
    }
    // The sidecar is the tool's own file, so removing it is safe. Screenshots
    // are left on disk: they may already be referenced from a copied packet.
    sendToExtension({ type: "ann-delete-file", name: sidecarName() })
      .then(function (res) {
        var removed = res && res.removed && res.removed.length;
        showToast(removed ? "Cleared · YAML removed, screenshots kept" : "Cleared · screenshots kept");
      })
      .catch(function () { showToast("Cleared all annotations"); });
  }

  // ═══════════════════════════════════════════
  // Color picker
  // ═══════════════════════════════════════════

  function closeColorPicker() {
    if (colorPicker && colorPicker.parentNode) colorPicker.parentNode.removeChild(colorPicker);
    colorPicker = null;
  }

  function showColorPicker() {
    if (colorPicker) { closeColorPicker(); return; }
    colorPicker = el("div", { id: "ann-color-picker" });

    MARKER_COLORS.forEach(function (hex) {
      var opt = el("div", { className: "ann-color-opt" + (hex === state.markerColor ? " active" : "") });
      opt.style.background = hex;
      opt.addEventListener("click", function (e) {
        e.stopPropagation();
        updateAccentColor(hex);
        closeColorPicker();
      });
      colorPicker.appendChild(opt);
    });

    // Position above the swatch
    var swRect = colorSwatch.getBoundingClientRect();
    colorPicker.style.bottom = (window.innerHeight - swRect.top + 8) + "px";
    colorPicker.style.right = (window.innerWidth - swRect.right) + "px";

    mount(colorPicker);
  }

  // ═══════════════════════════════════════════
  // Popup (comment input)
  // ═══════════════════════════════════════════

  var popupDiscard = null;

  function closePopup() {
    if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
    popup = null;
    closeColorPicker();
    if (popupDiscard) {
      var discard = popupDiscard;
      popupDiscard = null;
      try { discard(); } catch (e) {}
    }
  }

  // The design tab makes the popup taller than the click position allows.
  function clampPopupToViewport() {
    if (!popup) return;
    var r = popup.getBoundingClientRect();
    var maxLeft = window.innerWidth - r.width - 8;
    var maxTop = window.innerHeight - r.height - 8;
    if (r.left > maxLeft) popup.style.left = Math.max(8, maxLeft) + "px";
    if (r.top > maxTop) popup.style.top = Math.max(8, maxTop) + "px";
  }

  function getStyleEntries(target) {
    if (!target) return [];
    var s = window.getComputedStyle(target);
    var entries = [];
    var color = s.color;
    if (color && color !== "rgb(0, 0, 0)") entries.push(["color", color]);
    var bg = s.backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") entries.push(["background", bg]);
    if (s.fontSize) entries.push(["font-size", s.fontSize]);
    if (s.fontWeight && s.fontWeight !== "400" && s.fontWeight !== "normal") entries.push(["font-weight", s.fontWeight]);
    if (s.fontFamily) entries.push(["font-family", s.fontFamily]);
    var d = s.display;
    if (d && d !== "block" && d !== "inline") entries.push(["display", d]);
    if (s.borderRadius && s.borderRadius !== "0px") entries.push(["border-radius", s.borderRadius]);
    if (s.padding && s.padding !== "0px") entries.push(["padding", s.padding]);
    return entries;
  }

  function buildPopupHeader(elementName, target) {
    var header = el("div", { className: "ann-popup-header" });
    var chevWrap = el("span", { className: "ann-popup-chevron" });
    chevWrap.appendChild(iconEl("chevronDown"));
    var label = el("span", { className: "ann-popup-label" }, elementName);
    header.appendChild(chevWrap);
    header.appendChild(label);
    header.addEventListener("click", function () {
      header.classList.toggle("expanded");
    });

    var stylesBlock = el("div", { className: "ann-popup-styles" });
    var entries = target ? (target.nodeType ? getStyleEntries(target) : target) : [];
    entries.forEach(function (pair) {
      var line = document.createElement("div");
      line.innerHTML = '<span class="ann-prop">' + escHtml(pair[0]) + ':</span> ' +
        '<span class="ann-val">' + escHtml(pair[1]) + ';</span>';
      stylesBlock.appendChild(line);
    });

    return { header: header, styles: stylesBlock };
  }

  function positionPopup(x, y) {
    popup.style.left = Math.min(x + 12, window.innerWidth - 400) + "px";
    popup.style.top = Math.min(y + 12, window.innerHeight - 220) + "px";
  }

  // ═══════════════════════════════════════════
  // Design tab — live CSS preview, recorded as a change
  // ═══════════════════════════════════════════
  // The edit is applied to the live element so the user can see what they mean.
  // What ships in the packet is not the inline style but the before/after pair,
  // so the agent implements it in source instead of patching the DOM.

  var TEXT_TAGS = {
    p: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, span: 1, a: 1, label: 1, li: 1,
    td: 1, th: 1, strong: 1, em: 1, small: 1, b: 1, i: 1, code: 1, pre: 1,
    blockquote: 1, button: 1, legend: 1, dt: 1, dd: 1, summary: 1, figcaption: 1
  };

  var DESIGN_LENGTH_ROWS = [
    { prop: "padding", label: "Padding", step: 1, shift: 10, min: 0, max: 240 },
    { prop: "borderRadius", label: "Radius", step: 1, shift: 10, min: 0, max: 240 },
  ];
  var DESIGN_TEXT_ROWS = [
    { prop: "fontSize", label: "Font size", step: 1, shift: 10, min: 6, max: 200 },
    { prop: "fontWeight", label: "Weight", step: 100, shift: 100, min: 100, max: 900, unit: "" },
  ];

  function hasOwnText(node) {
    for (var i = 0; i < node.childNodes.length; i++) {
      var c = node.childNodes[i];
      if (c.nodeType === 3 && c.textContent.replace(/\s+/g, "")) return true;
    }
    return false;
  }

  function rgbToHex(v) {
    var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v || "");
    if (!m) return "#000000";
    function h(n) { var x = (+n).toString(16); return x.length === 1 ? "0" + x : x; }
    return "#" + h(m[1]) + h(m[2]) + h(m[3]);
  }

  function designRowsFor(target) {
    var cs = getComputedStyle(target);
    var rows = DESIGN_LENGTH_ROWS.slice();
    if (/flex|grid/.test(cs.display)) {
      rows.push({ prop: "gap", label: "Gap", step: 1, shift: 10, min: 0, max: 240 });
    }
    var textish = TEXT_TAGS[target.tagName.toLowerCase()] || hasOwnText(target);
    if (textish) {
      rows = rows.concat(DESIGN_TEXT_ROWS);
      rows.push({ prop: "color", label: "Text colour", kind: "color" });
    }
    rows.push({ prop: "backgroundColor", label: "Background", kind: "color" });
    return rows;
  }

  function computedValue(target, prop) {
    var v;
    try { v = getComputedStyle(target)[prop]; } catch (e) { v = ""; }
    return v == null ? "" : String(v);
  }

  function numericValue(target, prop) {
    var n = parseFloat(computedValue(target, prop));
    return isNaN(n) ? 0 : Math.round(n);
  }

  function applyDesign(target, prop, cssValue) {
    try { target.style.setProperty(cssPropName(prop), cssValue); } catch (e) {}
  }

  function revertDesignValue(target, prop) {
    try { target.style.removeProperty(cssPropName(prop)); } catch (e) {}
  }

  function revertDesignChanges(target, changes) {
    Object.keys(changes || {}).forEach(function (prop) { revertDesignValue(target, prop); });
  }

  function designSummary(changes) {
    return Object.keys(changes || {}).map(function (prop) {
      return cssPropName(prop) + " " + changes[prop].from + " \u2192 " + changes[prop].to;
    }).join(", ");
  }

  function revertAnnotationDesign(ann) {
    if (!ann || !ann.design) return;
    var target = elementForAnnotation(ann);
    if (target) revertDesignChanges(target, ann.design);
    ann.design = null;
  }

  // Re-apply the recorded preview after a reload so the page looks the way it did
  // when the note was written. Best effort: the element may be gone.
  function restoreAnnotationDesign(ann) {
    if (!ann || !ann.design) return;
    var target = elementForAnnotation(ann);
    if (!target) return;
    Object.keys(ann.design).forEach(function (prop) {
      var to = ann.design[prop] && ann.design[prop].to;
      if (to) applyDesign(target, prop, to);
    });
  }

  function formatRow(val, unit) {
    return String(val) + (unit == null ? "px" : unit);
  }

  // Builds the panel; mutates `changes` as the user edits and calls onDirty so the
  // tab can show a count.
  function buildDesignPanel(target, changes, onDirty) {
    var wrap = el("div", { className: "ann-design" });
    var resetters = [];

    wrap.appendChild(el("p", { className: "ann-dhint" },
      "Applies to the live page and ships as a before/after change."));

    designRowsFor(target).forEach(function (row) {
      if (row.kind === "color") {
        var fromRaw = computedValue(target, row.prop);
        var fromHex = rgbToHex(fromRaw);
        var input = el("input", { type: "color", "aria-label": row.label });
        input.value = fromHex;
        var rowEl = el("div", { className: "ann-drow wide" });
        rowEl.appendChild(el("span", { className: "ann-dlabel" }, row.label));
        rowEl.appendChild(input);
        input.addEventListener("input", function () {
          if (input.value.toLowerCase() === fromHex.toLowerCase()) {
            delete changes[row.prop];
            revertDesignValue(target, row.prop);
          } else {
            changes[row.prop] = { from: fromHex, to: input.value };
            applyDesign(target, row.prop, input.value);
          }
          rowEl.classList.toggle("changed", changes[row.prop] != null);
          onDirty();
        });
        resetters.push(function () {
          input.value = fromHex;
          revertDesignValue(target, row.prop);
          rowEl.classList.remove("changed");
        });
        wrap.appendChild(rowEl);
        return;
      }

      var unit = row.unit == null ? "px" : row.unit;
      var from = numericValue(target, row.prop);
      var value = from;
      var rowEl2 = el("div", { className: "ann-drow" });
      var label = el("span", { className: "ann-dlabel" }, row.label);
      var valEl = el("div", { className: "ann-dval", tabindex: "0", role: "spinbutton",
        "aria-label": row.label, title: "Arrow keys to nudge, Shift for x10" }, formatRow(value, unit));
      var minus = el("button", { className: "ann-dbtn", "aria-label": "Decrease " + row.label }, "\u2212");
      var plus = el("button", { className: "ann-dbtn", "aria-label": "Increase " + row.label }, "+");

      function commit(next) {
        value = Math.max(row.min, Math.min(row.max, next));
        valEl.textContent = formatRow(value, unit);
        if (value === from) {
          delete changes[row.prop];
          revertDesignValue(target, row.prop);
        } else {
          changes[row.prop] = { from: formatRow(from, unit), to: formatRow(value, unit) };
          applyDesign(target, row.prop, formatRow(value, unit));
        }
        rowEl2.classList.toggle("changed", changes[row.prop] != null);
        onDirty();
      }
      function nudge(dir, big) {
        commit(value + dir * row.step * (big ? Math.max(1, Math.round(row.shift / row.step)) : 1));
      }

      minus.addEventListener("click", function () { nudge(-1, false); });
      plus.addEventListener("click", function () { nudge(1, false); });
      valEl.addEventListener("keydown", function (e) {
        if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); nudge(1, e.shiftKey); }
        else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); nudge(-1, e.shiftKey); }
        else if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); }
      });

      rowEl2.appendChild(label);
      rowEl2.appendChild(minus);
      rowEl2.appendChild(valEl);
      rowEl2.appendChild(plus);
      resetters.push(function () {
        value = from;
        valEl.textContent = formatRow(from, unit);
        revertDesignValue(target, row.prop);
        rowEl2.classList.remove("changed");
      });
      wrap.appendChild(rowEl2);
    });

    var reset = el("button", { className: "ann-dreset", onClick: function () {
      Object.keys(changes).forEach(function (prop) { delete changes[prop]; });
      resetters.forEach(function (fn) { fn(); });
      onDirty();
    } }, "Reset to original");
    wrap.appendChild(reset);

    return wrap;
  }

  function showPopup(clickX, clickY, info, rect, selectedText) {
    closePopup();

    var bb = rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;

    popup = el("div", { id: "ann-popup" });

    var hp = buildPopupHeader(info.name, info.target);
    var textarea = el("textarea", { placeholder: "What should change?", rows: "3" });

    var designTarget = info.target;
    var designChanges = {};

    var noteTab = el("button", { className: "ann-tab active", type: "button" }, "Note");
    var designTab = el("button", { className: "ann-tab", type: "button" }, "Design");
    var tabCount = el("span", { className: "ann-tab-count" });
    designTab.appendChild(tabCount);
    var tabs = el("div", { className: "ann-tabs" }, [noteTab, designTab]);

    function updateTabCount() {
      var n = Object.keys(designChanges).length;
      tabCount.textContent = n ? String(n) : "";
    }

    var notePanel = el("div", {}, [textarea]);
    var designPanel = el("div", {}, [buildDesignPanel(designTarget, designChanges, updateTabCount)]);
    designPanel.style.display = "none";

    function setTab(which) {
      var design = which === "design";
      noteTab.classList.toggle("active", !design);
      designTab.classList.toggle("active", design);
      notePanel.style.display = design ? "none" : "block";
      designPanel.style.display = design ? "block" : "none";
      if (!design) textarea.focus();
      clampPopupToViewport();
    }
    noteTab.addEventListener("click", function () { setTab("note"); });
    designTab.addEventListener("click", function () { setTab("design"); });

    function discardDesign() {
      revertDesignChanges(designTarget, designChanges);
      Object.keys(designChanges).forEach(function (k) { delete designChanges[k]; });
      popupDiscard = null;
    }
    popupDiscard = discardDesign;

    var cancelBtn = el("button", { onClick: function () { closePopup(); } }, "Cancel");
    var addBtn = el("button", { className: "primary", onClick: function () {
      var comment = textarea.value.trim();
      var hasDesign = Object.keys(designChanges).length > 0;
      if (!comment && !hasDesign) { closePopup(); return; }
      // Saved, not discarded: the preview stays on the page and the annotation
      // records the pair, so deleting the note reverts it.
      popupDiscard = null;

      var annotation = {
        id: "ann-" + (++state.counter),
        x: clickX + window.scrollX,
        y: clickY + window.scrollY,
        comment: comment || designSummary(designChanges),
        design: Object.keys(designChanges).length ? JSON.parse(JSON.stringify(designChanges)) : undefined,
        element: info.name,
        elementPath: info.path,
        url: window.location.href,
        timestamp: Date.now(),
        selectedText: selectedText || undefined,
        boundingBox: bb,
        nearbyText: getNearbyText(info.target),
        cssClasses: getClasses(info.target),
        fullPath: getFullPath(info.target),
        xpath: getXPath(info.target),
        accessibility: getA11yInfo(info.target),
        computedStyles: getComputedSnapshot(info.target),
      };

      state.annotations.push(annotation);
      updateCount();
      renderMarkers();
      scheduleSave();
      closePopup();

      // Capture after the popup is gone so it can't appear in the image.
      if (rect) {
        attachScreenshot(annotation, {
          x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        }, state.counter);
      }
    }}, "Add");

    var actions = el("div", { className: "ann-popup-actions" }, [
      el("span", { className: "ann-spacer" }),
      cancelBtn,
      addBtn,
    ]);

    popup.appendChild(hp.header);
    popup.appendChild(hp.styles);
    popup.appendChild(tabs);
    popup.appendChild(notePanel);
    popup.appendChild(designPanel);
    popup.appendChild(actions);

    positionPopup(clickX, clickY);
    mount(popup);
    clampPopupToViewport();
    textarea.focus();

    textarea.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addBtn.click();
      if (e.key === "Escape") closePopup();
    });
  }

  function showEditPopup(x, y, index) {
    closePopup();
    var ann = state.annotations[index];
    if (!ann) return;

    popup = el("div", { id: "ann-popup" });

    // Parse stored styles string back into pairs for display
    var pairs = [];
    if (ann.computedStyles) {
      ann.computedStyles.replace(/([a-z]+): ([^,]+(?:,(?![a-z]+:)[^,]*)*)/g, function (_, k, v) {
        pairs.push([k, v.trim()]);
      });
    }
    var hp = buildPopupHeader(ann.element, pairs);
    var textarea = el("textarea", { placeholder: "What should change?", rows: "3" });
    textarea.value = ann.comment;

    var designBlock = null;
    if (ann.design && Object.keys(ann.design).length) {
      designBlock = el("div", {});
      designBlock.appendChild(el("p", { className: "ann-dhint" }, "Recorded design change"));
      var list = el("ul", { className: "ann-dlist" });
      Object.keys(ann.design).forEach(function (prop) {
        list.appendChild(el("li", {}, cssPropName(prop) + ": " + ann.design[prop].from +
          " \u2192 " + ann.design[prop].to));
      });
      designBlock.appendChild(list);
      designBlock.appendChild(el("button", { className: "ann-dreset", onClick: function () {
        revertAnnotationDesign(ann);
        updateCount();
        renderMarkers();
        scheduleSave();
        closePopup();
      } }, "Revert to original"));
    }

    var trashBtn = el("button", {
      className: "icon-only",
      title: "Delete annotation",
      "aria-label": "Delete annotation",
      onClick: function () {
        revertAnnotationDesign(ann);
        state.annotations.splice(index, 1);
        updateCount();
        renderMarkers();
        scheduleSave();
        closePopup();
      }
    });
    trashBtn.appendChild(iconEl("trash"));

    var cancelBtn = el("button", { onClick: function () { closePopup(); } }, "Cancel");
    var saveBtn = el("button", { className: "primary", onClick: function () {
      var comment = textarea.value.trim();
      if (!comment) {
        // Empty save = delete
        revertAnnotationDesign(ann);
        state.annotations.splice(index, 1);
      } else {
        ann.comment = comment;
      }
      updateCount();
      renderMarkers();
      scheduleSave();
      closePopup();
    }}, "Save");

    var actions = el("div", { className: "ann-popup-actions" }, [
      trashBtn,
      el("span", { className: "ann-spacer" }),
      cancelBtn,
      saveBtn,
    ]);

    popup.appendChild(hp.header);
    if (ann.screenshot && ann.screenshot.dataUrl) {
      popup.appendChild(el("img", {
        className: "ann-popup-shot",
        src: ann.screenshot.dataUrl,
        alt: "Annotation screenshot",
      }));
    }
    popup.appendChild(hp.styles);
    if (designBlock) popup.appendChild(designBlock);
    popup.appendChild(textarea);
    popup.appendChild(actions);

    positionPopup(x, y);
    mount(popup);
    clampPopupToViewport();
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    textarea.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveBtn.click();
      if (e.key === "Escape") closePopup();
    });
  }

  // ═══════════════════════════════════════════
  // Markers
  // ═══════════════════════════════════════════

  function renderMarkers() {
    markersContainer.innerHTML = "";
    state.annotations.forEach(function (a, i) {
      var marker = el("div", { className: "ann-marker" });
      marker.style.left = a.x + "px";
      marker.style.top = a.y + "px";

      // Inner visible circle — this scales on hover, the wrapper does not
      var circle = el("div", { className: "ann-marker-circle" });
      circle.style.background = state.markerColor;
      circle.style.boxShadow = "0 1px 2px rgba(242,234,219,0.10),0 4px 12px " +
        state.markerColor + "4D"; // 30% opacity hex suffix
      var numEl = el("span", { className: "ann-marker-num" }, String(i + 1));
      var editEl = el("span", { className: "ann-marker-edit" });
      editEl.appendChild(iconEl("pencilPlain"));
      circle.appendChild(numEl);
      circle.appendChild(editEl);
      marker.appendChild(circle);

      // Tooltip — sibling of circle so it doesn't scale with it
      var tip = el("div", { className: "ann-marker-tip" });
      // Screenshot thumbnail first, so hovering shows what you annotated.
      if (a.screenshot && a.screenshot.dataUrl) {
        tip.appendChild(el("img", {
          className: "ann-marker-shot",
          src: a.screenshot.dataUrl,
          alt: "Annotation screenshot",
        }));
      }
      var tipMeta = el("div");
      tipMeta.innerHTML = '<span class="ann-tip-element">' + escHtml(a.element) + '</span>' +
        '<span class="ann-tip-comment">' + escHtml(a.comment) + '</span>';
      tip.appendChild(tipMeta);
      marker.appendChild(tip);

      // Click to edit
      marker.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        showEditPopup(e.clientX, e.clientY, i);
      });

      markersContainer.appendChild(marker);
    });
  }

  function escHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // ═══════════════════════════════════════════
  // Event Handlers
  // ═══════════════════════════════════════════

  function isToolbarElement(el) {
    if (!el) return false;
    var node = el;
    while (node) {
      if (node.id === "ann-toolbar" || node.id === "ann-popup" ||
          node.id === "ann-color-picker" || node.id === "ann-tip" ||
          node.id === "ann-ruler-h" || node.id === "ann-ruler-v" ||
          node.id === "ann-ruler-corner" ||
          (node.className && typeof node.className === "string" && node.className.indexOf("ann-guide") !== -1) ||
          node.id === "ann-hover-highlight" || node.id === "ann-hover-label" ||
          (node.className && typeof node.className === "string" && node.className.indexOf("ann-marker") !== -1)) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  // Keyboard selection state. navStack holds the ancestors ArrowUp walked so
  // ArrowDown can retrace the exact path instead of guessing at a child.
  var navStack = [];
  var keyNavUsed = false;

  function isNavigable(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node === document.documentElement || node === document.body) return false;
    if (rootEl && rootEl.contains(node)) return false;
    if (isToolbarElement(node)) return false;
    return true;
  }

  // Paint the highlight + label for one element. Shared by the pointer and the
  // keyboard so both paths look and behave identically.
  function paintHover(target) {
    state.hoveredEl = target;
    var rect = target.getBoundingClientRect();

    hoverHighlight.style.display = "block";
    hoverHighlight.style.left = rect.left + "px";
    hoverHighlight.style.top = rect.top + "px";
    hoverHighlight.style.width = rect.width + "px";
    hoverHighlight.style.height = rect.height + "px";
    hoverHighlight.style.borderColor = state.markerColor;
    hoverHighlight.style.background = state.markerColor + "0A";

    var info = identifyElement(target);
    hoverLabel.style.display = "block";
    hoverLabel.textContent = info.name + "  " + info.path;
    // Progressive disclosure: the key hints appear once the user has actually
    // navigated with the keyboard, so the pointer flow stays uncluttered.
    if (keyNavUsed) {
      var keys = el("span", { className: "ann-keys" });
      keys.innerHTML = "<b>&#8593;</b> parent &#183; <b>&#8592;&#8594;</b> sibling &#183; <b>Enter</b> select";
      hoverLabel.appendChild(keys);
    }

    var labelTop = rect.top - 28;
    if (labelTop < 4) labelTop = rect.bottom + 6;
    hoverLabel.style.left = Math.max(4, rect.left) + "px";
    hoverLabel.style.top = labelTop + "px";
  }

  function handleMouseMove(e) {
    if (!state.active) return;
    if (isToolbarElement(e.target)) { hideHover(); return; }

    var target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || isToolbarElement(target)) { hideHover(); return; }

    // The pointer is the anchor: any keyboard trail from here is stale.
    navStack.length = 0;
    paintHover(target);
  }

  // Arrows walk the DOM: up to the parent, down back along the walked path,
  // left/right across siblings.
  function navigateSelection(dir) {
    var current = state.hoveredEl;
    if (!isNavigable(current)) return;
    var next = null;
    if (dir === "up") next = current.parentElement;
    else if (dir === "down") next = navStack.pop();
    else if (dir === "prev") next = current.previousElementSibling;
    else if (dir === "next") next = current.nextElementSibling;
    if (!isNavigable(next)) { if (dir === "down") navStack.length = 0; return; }
    if (dir === "up") navStack.push(current);
    keyNavUsed = true;
    paintHover(next);
  }

  // Enter commits the highlighted element as the annotation target.
  function selectHovered() {
    var target = state.hoveredEl;
    if (!isNavigable(target)) return;
    var info = identifyElement(target);
    info.target = target;
    var rect = target.getBoundingClientRect();
    var sel = window.getSelection();
    var selectedText = sel && sel.toString().trim() ? sel.toString().trim() : null;
    showPopup(
      Math.round(rect.left + rect.width / 2),
      Math.round(rect.top + rect.height / 2),
      info, rect, selectedText
    );
  }

  function handleClick(e) {
    if (!state.active) return;
    if (isToolbarElement(e.target)) return;

    e.preventDefault();
    e.stopPropagation();

    var target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || isToolbarElement(target)) return;

    var info = identifyElement(target);
    info.target = target;
    var rect = target.getBoundingClientRect();

    // Check for text selection
    var sel = window.getSelection();
    var selectedText = sel && sel.toString().trim() ? sel.toString().trim() : null;

    showPopup(e.clientX, e.clientY, info, rect, selectedText);
  }

  function handleKeydown(e) {
    // Alt+A: bring back hidden toolbar OR toggle annotate mode
    if (e.altKey && (e.code === "KeyA" || (e.key && e.key.toLowerCase() === "a"))) {
      e.preventDefault();
      if (state.toolbarHidden) {
        showToolbar();
        if (!state.active) toggleActive();
      } else {
        toggleActive();
      }
    }
    // Crosshair keyboard selection: arrows walk the DOM, Enter selects.
    if (state.active && !popup && !colorPicker &&
        !(document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName))) {
      var nav = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "prev", ArrowRight: "next" }[e.key];
      if (nav) {
        e.preventDefault(); e.stopPropagation();
        navigateSelection(nav);
        return;
      }
      if (e.key === "Enter" && state.hoveredEl) {
        e.preventDefault(); e.stopPropagation();
        selectHovered();
        return;
      }
    }

    // Single-key shortcuts (only when no popup/input is focused)
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !popup && !colorPicker &&
        document.activeElement && document.activeElement.tagName !== "TEXTAREA" &&
        document.activeElement.tagName !== "INPUT") {
      var k = e.key.toLowerCase();
      if (k === "c" && state.annotations.length > 0) { e.preventDefault(); copyOutput(); }
      if (k === "d" && state.annotations.length > 0) { e.preventDefault(); downloadOutput(); }
      if (k === "m") { e.preventDefault(); showColorPicker(); }
      if (k === "h") { e.preventDefault(); toggleMarkersVisibility(); }
    }
    // Escape to deactivate or close popup
    if (e.key === "Escape") {
      if (colorPicker) { closeColorPicker(); return; }
      if (popup) { closePopup(); return; }
      if (state.active) toggleActive();
    }
  }

  // ═══════════════════════════════════════════
  // Init
  // ═══════════════════════════════════════════

  function init() {
    createToolbar();
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("scroll", function () {
      if (state.active) hideHover();
      drawRulers();
      updateGuidePositions();
    }, { passive: true });
    window.addEventListener("resize", function () {
      drawRulers();
      clampToolbar();
    }, { passive: true });

    // Edge-hover reveal for rulers
    document.addEventListener("mousemove", handleRulerProximity, { passive: true });
    document.documentElement.addEventListener("mouseleave", function () {
      hideRulerAxis("h");
      hideRulerAxis("v");
    });

    // Restore what this page had before the reload, and flush any pending save
    // when the tab goes away or is backgrounded mid-edit.
    restoreState();
    window.addEventListener("pagehide", flushSave);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flushSave();
    });

    // Publish a tiny control hook so re-injection (Chrome extension click,
    // second <script> tag, etc.) toggles this instance instead of duplicating.
    window.__annotateHtml = {
      version: 1,
      toggle: function () {
        if (state.toolbarHidden) showToolbar();
        else hideToolbar();
      },
      show: showToolbar,
      hide: hideToolbar,
      // Programmatic API for seeding annotations and guides onto the page.
      seed: function (annotations, seedGuides) {
        if (annotations) {
          annotations.forEach(function (a) {
            var target = typeof a.target === "string"
              ? document.querySelector(a.target) : a.target;
            if (!target) return;
            var rect = target.getBoundingClientRect();
            var info = identifyElement(target, getElementPath(target));
            var bb = "x:" + Math.round(rect.x) + ", y:" + Math.round(rect.y) +
              " (" + Math.round(rect.width) + "x" + Math.round(rect.height) + "px)";
            state.annotations.push({
              id: "ann-" + (++state.counter),
              x: rect.x + rect.width / 2 + window.scrollX,
              y: rect.y + window.scrollY,
              comment: a.comment || "",
              element: info.name,
              elementPath: info.path,
              url: a.url || window.location.href,
              timestamp: Date.now(),
              boundingBox: bb,
              nearbyText: getNearbyText(target),
              cssClasses: getClasses(target),
              fullPath: getFullPath(target),
              xpath: getXPath(target),
              accessibility: getA11yInfo(target),
              computedStyles: getComputedSnapshot(target),
              screenshot: a.screenshot
                ? { name: "", dataUrl: a.screenshot, path: a.screenshotPath || null }
                : undefined,
            });
          });
          updateCount();
          renderMarkers();
          scheduleSave();
        }
        if (seedGuides) {
          seedGuides.forEach(function (g) {
            var viewPos = g.dir === "h"
              ? g.pos - window.scrollY
              : g.pos - window.scrollX;
            addGuide(g.dir, viewPos, g.pos);
          });
        }
      }
    };
  }

  // Boot when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
