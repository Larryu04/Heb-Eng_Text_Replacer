const statusEl = document.getElementById("status");
const buttons = document.querySelectorAll("button[data-direction]");

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind || "";
}

buttons.forEach((btn) =>
  btn.addEventListener("click", () => run(btn.dataset.direction))
);

async function run(direction) {
  buttons.forEach((b) => (b.disabled = true));
  setStatus("");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const target = { tabId: tab.id, allFrames: true };

    // Load the keymap into the page's isolated world, then run the replacer.
    await chrome.scripting.executeScript({ target, files: ["src/keymap.js"] });
    const results = await chrome.scripting.executeScript({
      target,
      func: replaceSelection,
      args: [direction]
    });

    const done = results.find((r) => r.result && r.result.ok);
    if (done) {
      setStatus("Replaced " + done.result.count + " character(s).", "ok");
      setTimeout(() => window.close(), 600);
    } else {
      setStatus("No text selected in an editable field.", "error");
    }
  } catch (err) {
    // e.g. chrome:// pages, the Web Store, or other restricted URLs.
    setStatus("Can't run on this page.", "error");
    console.error(err);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

// Runs inside the page (once per frame). Must be self-contained: it can only
// use its arguments and globals from the page's isolated world (HebEngKeymap).
function replaceSelection(direction) {
  const convert = (t) => globalThis.HebEngKeymap.convert(t, direction);
  const TEXT_INPUT_TYPES = ["text", "search", "url", "tel", "email", "password", ""];

  // Find the deepest focused element, descending into open shadow roots.
  let el = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) {
    el = el.shadowRoot.activeElement;
  }

  // --- <input> / <textarea> ---
  const isTextField =
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.includes(el.type));

  if (isTextField) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start == null || start === end) return { ok: false };

    const original = el.value.slice(start, end);
    const replacement = convert(original);
    const expected = el.value.slice(0, start) + replacement + el.value.slice(end);

    el.focus();
    el.setSelectionRange(start, end);
    // execCommand keeps the native undo stack and fires real input events.
    let ok = false;
    try { ok = document.execCommand("insertText", false, replacement); } catch (e) {}

    if (!ok || el.value !== expected) {
      // Fallback: use the native setter so React/Angular notice the change.
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, expected);
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true, inputType: "insertText", data: replacement
      }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    el.setSelectionRange(start, start + replacement.length);
    return { ok: true, count: original.length };
  }

  // --- contenteditable ---
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return { ok: false };

  const range = sel.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const host = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)
    ?.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
  if (!host || !host.isContentEditable) return { ok: false };

  const original = sel.toString();
  const replacement = convert(original);
  const savedRange = range.cloneRange();

  // Focusing can move the caret, so restore the saved selection afterwards.
  host.focus();
  sel.removeAllRanges();
  sel.addRange(savedRange);

  let ok = false;
  try { ok = document.execCommand("insertText", false, replacement); } catch (e) {}

  if (!ok) {
    // Fallback: manual DOM edit plus events for framework-driven editors.
    host.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true, cancelable: true, inputType: "insertText", data: replacement
    }));
    savedRange.deleteContents();
    const textNode = document.createTextNode(replacement);
    savedRange.insertNode(textNode);
    savedRange.setStartAfter(textNode);
    savedRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(savedRange);
    host.dispatchEvent(new InputEvent("input", {
      bubbles: true, inputType: "insertText", data: replacement
    }));
  }
  return { ok: true, count: original.length };
}
