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
  "verify-failed": "Couldn't confirm the text was replaced. If it didn't change, convert it here.",
  "too-short": "Only one character was selected. Select the whole text, or convert it here.",
  "not-editable": "The selected text isn't in an editable field.",
  "no-selection": "No text selected in an editable field."
};
const REASON_ORDER = Object.keys(REASONS);

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind || "";
}

// Swap the in-place buttons for the paste-convert-copy UI.
function showFallback(message, prefill) {
  inplaceView.hidden = true;
  fallbackView.hidden = false;
  fallbackWarning.textContent = message;
  if (prefill) fallbackInput.value = prefill;
  setStatus("");
  fallbackInput.focus();
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Blocklisted or restricted (chrome://, Web Store, ...) pages skip straight to
// the fallback. tab.url is readable here because activeTab was just granted.
async function init() {
  const tab = await getActiveTab();
  const url = (tab && tab.url) || "";
  if (!/^(https?|file):/.test(url) || HebEngBlocklist.isBlocked(url)) {
    showFallback(UNSUPPORTED);
  }
}

// --- In-place mode ---

buttons.forEach((btn) =>
  btn.addEventListener("click", () => run(btn.dataset.direction))
);

async function run(direction) {
  buttons.forEach((b) => (b.disabled = true));
  setStatus("");
  try {
    const tab = await getActiveTab();
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
      showFallback(REASONS[outcome.reason] || UNSUPPORTED, outcome.text);
    }
  } catch (err) {
    // e.g. pages the extension isn't allowed to script.
    console.error(err);
    showFallback(UNSUPPORTED);
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

// --- Fallback mode ---

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
    // Clipboard can be refused if the popup lost focus; let the user copy by hand.
    console.error(err);
    fallbackOutput.select();
    setStatus("Couldn't copy automatically. Press Ctrl+C.", "error");
  }
}

init();
