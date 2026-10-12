const statusEl = document.getElementById("status");
const inplaceView = document.getElementById("inplace-view");
const fallbackView = document.getElementById("fallback-view");
const fallbackWarning = document.getElementById("fallback-warning");
const fallbackInput = document.getElementById("fallback-input");
const fallbackResult = document.getElementById("fallback-result");
const fallbackOutput = document.getElementById("fallback-output");
const copyBtn = document.getElementById("copy-btn");
const buttons = document.querySelectorAll("button[data-direction]");

const UNSUPPORTED = "In-place replacement is not supported on this site.";

// Failure reasons reported by src/replacer.js, most specific first. When
// several frames fail, the most specific reason is the one shown.
const REASONS = {
  "hidden-target": UNSUPPORTED,
  "code-editor": "In-place replacement is not supported in code editors.",
  "verify-failed": "Couldn't confirm the text was replaced. If it didn't change, convert it below.",
  "too-short": "Only one character was selected. Select the whole text on the page, then click Grab selection.",
  "not-editable": "The selected text isn't in an editable field.",
  "no-selection": "No text selected in an editable field."
};
const REASON_ORDER = Object.keys(REASONS);

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind || "";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// The popup closes as soon as the user clicks the page, so the fallback UI
// can't live here. Inject it into the page as a floating panel instead; on
// pages that can't be scripted, open the fallback in its own window.
async function openFallback(tab, message, prefill) {
  try {
    const target = { tabId: tab.id }; // top frame only
    await chrome.scripting.executeScript({
      target, files: ["src/keymap.js", "src/overlay.js"]
    });
    await chrome.scripting.executeScript({
      target,
      func: (msg, text) => globalThis.HebEngOverlay.show(msg, text),
      args: [message, prefill || ""]
    });
  } catch (err) {
    // e.g. chrome://, brave://, the Web Store, or the PDF viewer.
    console.error(err);
    const params = new URLSearchParams({ standalone: "1", msg: message, text: prefill || "" });
    await chrome.windows.create({
      url: chrome.runtime.getURL("popup/popup.html?" + params),
      type: "popup", width: 320, height: 460
    });
  }
  window.close();
}

// Blocklisted or restricted pages skip straight to the fallback. tab.url is
// readable here because activeTab was just granted.
async function init() {
  const params = new URLSearchParams(location.search);
  if (params.has("standalone")) {
    showStandaloneFallback(params.get("msg") || UNSUPPORTED, params.get("text"));
    return;
  }
  const tab = await getActiveTab();
  const url = (tab && tab.url) || "";
  if (!/^(https?|file):/.test(url) || HebEngBlocklist.isBlocked(url)) {
    await openFallback(tab, UNSUPPORTED);
    return;
  }
  document.body.classList.remove("loading");
}

// --- In-place mode ---

buttons.forEach((btn) =>
  btn.addEventListener("click", () => run(btn.dataset.direction))
);

async function run(direction) {
  buttons.forEach((b) => (b.disabled = true));
  setStatus("");
  const tab = await getActiveTab();
  try {
    const target = { tabId: tab.id, allFrames: true };

    // Load the keymap and replacer into the page's isolated world, then run it.
    await chrome.scripting.executeScript({
      target, files: ["src/keymap.js", "src/replacer.js"]
    });
    const results = await chrome.scripting.executeScript({
      target,
      func: (dir) => globalThis.HebEngReplacer.replaceSelection(dir),
      args: [direction]
    });

    const outcome = pickOutcome(results.map((r) => r.result));
    // Sanity check: a real fix touches more than one character.
    if (outcome.ok && outcome.count > 1) {
      setStatus("Replaced " + outcome.count + " character(s).", "ok");
      setTimeout(() => window.close(), 600);
    } else {
      await openFallback(tab, REASONS[outcome.reason] || UNSUPPORTED, outcome.text);
    }
  } catch (err) {
    // e.g. pages the extension isn't allowed to script.
    console.error(err);
    await openFallback(tab, UNSUPPORTED);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

// One result per frame: any success wins, otherwise the most specific failure.
function pickOutcome(frameResults) {
  const valid = frameResults.filter(Boolean);
  const success = valid.find((r) => r.ok);
  if (success) return success;
  const rank = (r) => {
    const i = REASON_ORDER.indexOf(r.reason);
    return i === -1 ? REASON_ORDER.length : i;
  };
  valid.sort((a, b) => rank(a) - rank(b));
  return valid[0] || { ok: false, reason: "no-selection" };
}

// --- Standalone fallback window (pages the overlay can't be injected into) ---

function showStandaloneFallback(message, prefill) {
  document.body.classList.remove("loading");
  document.body.classList.add("standalone");
  inplaceView.hidden = true;
  fallbackView.hidden = false;
  fallbackWarning.textContent = message;
  if (prefill) fallbackInput.value = prefill;
  fallbackInput.focus();
}

document.querySelectorAll("button[data-fallback-direction]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const text = fallbackInput.value;
    if (!text) {
      setStatus("Paste some text first.", "error");
      fallbackInput.focus();
      return;
    }
    fallbackOutput.value = HebEngKeymap.convert(text, btn.dataset.fallbackDirection);
    fallbackResult.hidden = false;
    copyResult();
  })
);

copyBtn.addEventListener("click", copyResult);

async function copyResult() {
  try {
    await navigator.clipboard.writeText(fallbackOutput.value);
    setStatus("Copied! Paste it back into your document.", "ok");
  } catch (err) {
    // Clipboard can be refused if the window lost focus; let the user copy by hand.
    console.error(err);
    fallbackOutput.select();
    setStatus("Couldn't copy automatically. Press Ctrl+C.", "error");
  }
}

init();
