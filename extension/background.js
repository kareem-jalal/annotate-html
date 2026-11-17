// background.js — MV3 service worker for Annotate HTML
// Injects annotate.js into the active tab on action click OR keyboard shortcut.
// Subsequent invocations on the same tab hit the double-injection guard inside
// annotate.js and toggle toolbar visibility instead of building duplicates.
//
// It also serves two annotation-screenshot requests from the injected script:
//   ann-capture    → captureVisibleTab of the sender's window (needs activeTab)
//   ann-save-shot  → write the cropped JPEG into Downloads/annotate-html/...
// Both are tab-scoped to the sender and never touch the network.

const RESTRICTED = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "https://chrome.google.com/webstore",
  "https://chromewebstore.google.com",
];

const SHOT_NAME_RE = /^annotate-html\/[a-z0-9.-]+-\d{8}-\d{6}\/ann-\d{2,3}\.jpg$/i;
const SHOT_DATA_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const SHOT_MAX_BYTES = 4 * 1024 * 1024;

// The YAML sidecar lives in the same per-page folder as the screenshots, so one
// page maps to one folder. Deletes are gated on the same pattern: the extension
// may only ever touch files it named itself, inside annotate-html/.
const SIDECAR_NAME_RE = /^annotate-html\/[a-z0-9.-]+-\d{8}-\d{6}\/annotations\.yaml$/i;
const SIDECAR_MAX_CHARS = 2 * 1024 * 1024;

async function injectIntoTab(tab) {
  if (!tab || !tab.id) return;
  const url = tab.url || "";
  if (RESTRICTED.some((p) => url.startsWith(p))) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      files: ["annotate.js"],
      world: "ISOLATED",
    });
  } catch (err) {
    console.warn("[annotate] inject failed:", err);
  }
}

// Toolbar icon click
chrome.action.onClicked.addListener(injectIntoTab);

// Global keyboard shortcut (Alt+Shift+A by default, rebindable in
// chrome://extensions/shortcuts)
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-annotate") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) injectIntoTab(tab);
});

// ── Annotation screenshots ────────────────────────────────────────────────

function captureVisible(sender) {
  const windowId = sender.tab ? sender.tab.windowId : undefined;
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 92 }, (dataUrl) => {
      const err = chrome.runtime.lastError;
      if (err || !dataUrl) {
        resolve({ ok: false, error: (err && err.message) || "capture failed" });
        return;
      }
      resolve({ ok: true, dataUrl });
    });
  });
}

async function saveShot(message) {
  const dataUrl = typeof message.dataUrl === "string" ? message.dataUrl : "";
  const name = typeof message.name === "string" ? message.name : "";

  if (!SHOT_NAME_RE.test(name)) return { ok: false, error: "invalid file name" };
  if (!SHOT_DATA_RE.test(dataUrl)) return { ok: false, error: "invalid image payload" };
  if (dataUrl.length > SHOT_MAX_BYTES) return { ok: false, error: "image too large" };

  try {
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: name,
      saveAs: false,
      conflictAction: "uniquify",
    });

    // Resolve the absolute path so the copied markdown can point an agent at
    // the real file on disk instead of a bare file name.
    for (let attempt = 0; attempt < 50; attempt++) {
      const [item] = await chrome.downloads.search({ id: downloadId });
      if (item && item.filename) {
        return { ok: true, filename: item.filename, downloadId };
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return { ok: false, error: "download did not start" };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

// ── YAML sidecar ──────────────────────────────────────────────────────────
// Writes the annotation packet next to the screenshots and overwrites it in
// place, so one page keeps exactly one annotations.yaml no matter how many times
// it is edited.

function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function writeSidecar(message) {
  const name = typeof message.name === "string" ? message.name : "";
  const text = typeof message.text === "string" ? message.text : "";

  if (!SIDECAR_NAME_RE.test(name)) return { ok: false, error: "invalid file name" };
  if (!text.trim()) return { ok: false, error: "empty packet" };
  if (text.length > SIDECAR_MAX_CHARS) return { ok: false, error: "packet too large" };

  try {
    const downloadId = await chrome.downloads.download({
      url: "data:text/yaml;base64," + toBase64Utf8(text),
      filename: name,
      saveAs: false,
      // Same file every time: the sidecar is a live document, not version history.
      conflictAction: "overwrite",
    });

    for (let attempt = 0; attempt < 50; attempt++) {
      const [item] = await chrome.downloads.search({ id: downloadId });
      if (item && item.filename) return { ok: true, filename: item.filename, downloadId };
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return { ok: true, filename: name, downloadId };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

// Deletes a file this extension named. The name must match the sidecar pattern
// (or a shot pattern) and the search is anchored to that exact path suffix, so a
// delete can never reach outside annotate-html/ or hit a file the user made.
async function deleteOwnFile(message) {
  const name = typeof message.name === "string" ? message.name : "";
  if (!SIDECAR_NAME_RE.test(name)) return { ok: false, error: "refusing to delete that path" };

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hits = await chrome.downloads.search({ filenameRegex: escaped + "$" });
  const removed = [];

  for (const item of hits) {
    if (!item || !item.filename) continue;
    try {
      await chrome.downloads.removeFile(item.id);
      removed.push(item.filename);
    } catch (err) {
      // File already gone, or the browser no longer owns it: not an error here.
    }
    // Drop the history row too, so a failed delete is not resurrected by a later
    // search matching a stale record.
    try {
      await chrome.downloads.erase({ id: item.id });
    } catch (err) { /* history cleanup is best-effort */ }
  }

  return { ok: true, removed };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only this extension, only from a tab it injected into.
  if (!message || sender.id !== chrome.runtime.id || !sender.tab) return;

  if (message.type === "ann-capture") {
    captureVisible(sender)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "ann-save-shot") {
    saveShot(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "ann-write-yaml") {
    writeSidecar(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "ann-delete-file") {
    deleteOwnFile(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});
