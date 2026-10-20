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
});
