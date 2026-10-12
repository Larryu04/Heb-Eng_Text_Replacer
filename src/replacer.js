// Injected into the page (every frame, isolated world) after keymap.js.
// replaceSelection() converts the selected text in place and returns a result
// the popup uses to decide whether to fall back to manual mode:
//   { ok: true,  count }                 replaced and verified
//   { ok: false, reason, text? }         nothing changed (or couldn't verify)
// `text` is the selected text when one was found, so the popup can prefill it.
(function () {
  const TEXT_INPUT_TYPES = ["text", "search", "url", "tel", "email", "password", ""];
  // Code editors keep the real text in their own model; editing the DOM breaks them.
  const CODE_EDITOR_SELECTOR = ".monaco-editor, .cm-editor, .CodeMirror, .ace_editor";
  // A one-character "selection" is what canvas apps leave in their hidden input.
  const MIN_LENGTH = 2;

  // Elements that capture keystrokes for canvas-based apps are usually tiny,
  // transparent, or off-screen, and often live in a tiny iframe.
  function isHidden(el) {
    if (window.innerWidth <= 2 || window.innerHeight <= 2) return true;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 2 || rect.height <= 2) return true;
    if (rect.right < 0 || rect.bottom < 0) return true;
    return parseFloat(getComputedStyle(el).opacity) === 0;
  }

  // Checks shared by both field kinds, run before anything is modified.
  function precheck(el, original) {
    if (el.closest(CODE_EDITOR_SELECTOR)) return { ok: false, reason: "code-editor", text: original };
    if (isHidden(el)) return { ok: false, reason: "hidden-target" };
    if (original.length < MIN_LENGTH) return { ok: false, reason: "too-short", text: original };
    return null;
  }

  function replaceInTextField(el, convert) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start == null || start === end) return { ok: false, reason: "no-selection" };

    const original = el.value.slice(start, end);
    const failure = precheck(el, original);
    if (failure) return failure;

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

    if (el.value !== expected) return { ok: false, reason: "verify-failed", text: original };
    el.setSelectionRange(start, start + replacement.length);
    return { ok: true, count: original.length };
  }

  function replaceInContentEditable(sel, convert) {
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const host = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)
      ?.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
    const original = sel.toString();
    // Static page text: can't edit it, but the popup can still convert it.
    if (!host || !host.isContentEditable) return { ok: false, reason: "not-editable", text: original };

    const failure = precheck(host, original);
    if (failure) return failure;

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

    if (!host.textContent.includes(replacement)) {
      return { ok: false, reason: "verify-failed", text: original };
    }
    return { ok: true, count: original.length };
  }

  function replaceSelection(direction) {
    const convert = (t) => globalThis.HebEngKeymap.convert(t, direction);

    // Find the deepest focused element, descending into open shadow roots.
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }

    const isTextField =
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.includes(el.type));
    if (isTextField) return replaceInTextField(el, convert);

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return { ok: false, reason: "no-selection" };
    return replaceInContentEditable(sel, convert);
  }

  globalThis.HebEngReplacer = { replaceSelection };
})();
