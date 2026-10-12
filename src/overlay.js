// Fallback UI injected into the page (top frame, isolated world) after
// keymap.js. Unlike the popup it stays open while the user selects and copies
// text on the page. Lives in a closed shadow root so page CSS can't touch it.
(function () {
  if (globalThis.HebEngOverlay) return; // already injected into this page

  const CSS = `
    :host { all: initial; }
    .panel {
      --bg: #fff; --fg: #1f2328; --muted: #59636e; --border: #d1d9e0;
      --accent: #0969da; --accent-hover: #0550ae; --accent-soft: #ddf4ff;
      --warn-bg: #fff8c5; --warn-fg: #6f4e00; --ok: #1a7f37; --err: #cf222e;
      position: fixed; top: 16px; right: 16px; z-index: 2147483647;
      width: 300px; box-sizing: border-box; padding: 0 12px 12px;
      font: 14px system-ui, sans-serif; color: var(--fg); background: var(--bg);
      border: 1px solid var(--border); border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0, 0, 0, .25);
    }
    @media (prefers-color-scheme: dark) {
      .panel {
        --bg: #1f2328; --fg: #e6edf3; --muted: #9198a1; --border: #3d444d;
        --accent: #4493f8; --accent-hover: #1f6feb; --accent-soft: #12263f;
        --warn-bg: #3b2e00; --warn-fg: #f2cc60; --ok: #3fb950; --err: #ff7b72;
      }
    }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      margin: 0 -12px 10px; padding: 8px 8px 8px 12px;
      border-bottom: 1px solid var(--border); cursor: move; user-select: none;
    }
    h1 { margin: 0; font-size: 14px; font-weight: 600; }
    .close {
      width: auto; margin: 0; padding: 2px 8px; font-size: 16px; line-height: 1;
      background: transparent; border-color: transparent; color: var(--muted);
    }
    .close:hover { background: var(--accent-soft); color: var(--fg); }
    .warning {
      margin: 0 0 8px; padding: 6px 8px; font-size: 12px; border-radius: 6px;
      background: var(--warn-bg); color: var(--warn-fg);
    }
    .hint { display: block; margin: 0 0 4px; font-size: 12px; color: var(--muted); }
    textarea {
      display: block; box-sizing: border-box; width: 100%; margin: 0 0 8px; padding: 6px;
      font: 13px system-ui, sans-serif; color: var(--fg); background: var(--bg);
      border: 1px solid var(--border); border-radius: 6px; resize: vertical;
    }
    .row { display: flex; gap: 6px; }
    button {
      display: block; width: 100%; margin: 0 0 8px; padding: 8px;
      font: 12px system-ui, sans-serif; color: #fff; background: var(--accent);
      border: 1px solid var(--accent); border-radius: 6px; cursor: pointer;
    }
    button:hover { background: var(--accent-hover); }
    button.secondary { color: var(--accent); background: transparent; }
    button.secondary:hover { background: var(--accent-soft); }
    .status { min-height: 1.2em; margin: 0; font-size: 12px; }
    .status.ok { color: var(--ok); }
    .status.error { color: var(--err); }
    [hidden] { display: none !important; }
  `;

  const HTML = `
    <div class="panel" role="dialog" aria-label="Fix keyboard layout">
      <div class="header">
        <h1>Fix keyboard layout</h1>
        <button class="close" title="Close (Esc)" aria-label="Close">&times;</button>
      </div>
      <p class="warning"></p>
      <label class="hint" for="input">Select the text on the page and click <b>Grab selection</b>, or paste it here:</label>
      <textarea id="input" dir="auto" rows="4" spellcheck="false"></textarea>
      <button class="secondary grab">Grab selection</button>
      <div class="row">
        <button data-direction="en2he">English to Hebrew</button>
        <button data-direction="he2en">Hebrew to English</button>
      </div>
      <div class="result" hidden>
        <label class="hint" for="output">Result:</label>
        <textarea id="output" dir="auto" rows="4" readonly></textarea>
        <button class="secondary copy">Copy to Clipboard</button>
      </div>
      <p class="status" role="status"></p>
    </div>
  `;

  // Keep the page from seeing keystrokes/clipboard events typed into the panel
  // (editors like Google Docs have global shortcuts that would swallow them).
  const ISOLATED_EVENTS = [
    "keydown", "keyup", "keypress", "beforeinput", "input",
    "paste", "copy", "cut", "compositionstart", "compositionend"
  ];

  let host = null;
  let ui = null;
  let lastSelection = "";

  // Remember the last text selected on the page, since clicking into the panel
  // (or the page clearing it) can lose the live selection.
  function onSelectionChange() {
    const text = readPageSelection();
    if (text) lastSelection = text;
  }

  function readPageSelection() {
    const el = document.activeElement;
    if (el && el !== host &&
        (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) &&
        typeof el.selectionStart === "number" && el.selectionStart !== el.selectionEnd) {
      return el.value.slice(el.selectionStart, el.selectionEnd);
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || (sel.anchorNode && host && host.contains(sel.anchorNode))) return "";
    return sel.toString();
  }

  function create() {
    host = document.createElement("div");
    host.id = "hebeng-fallback-overlay";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${CSS}</style>${HTML}`;
    ISOLATED_EVENTS.forEach((type) => root.addEventListener(type, (e) => e.stopPropagation()));

    const $ = (sel) => root.querySelector(sel);
    ui = {
      panel: $(".panel"),
      warning: $(".warning"),
      input: $("#input"),
      result: $(".result"),
      output: $("#output"),
      status: $(".status")
    };

    $(".close").addEventListener("click", hide);
    root.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });

    const grab = $(".grab");
    // Don't let the click move focus/selection away from the page text.
    grab.addEventListener("mousedown", (e) => e.preventDefault());
    grab.addEventListener("click", () => {
      const text = readPageSelection() || lastSelection;
      if (text) {
        ui.input.value = text;
        setStatus("");
      } else {
        setStatus("Nothing selected. Copy the text (Ctrl+C) and paste it here.", "error");
        ui.input.focus();
      }
    });

    root.querySelectorAll("button[data-direction]").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (!ui.input.value) {
          setStatus("Select or paste some text first.", "error");
          ui.input.focus();
          return;
        }
        ui.output.value = globalThis.HebEngKeymap.convert(ui.input.value, btn.dataset.direction);
        ui.result.hidden = false;
        copyResult();
      })
    );
    $(".copy").addEventListener("click", copyResult);

    makeDraggable($(".header"), ui.panel);
    document.addEventListener("selectionchange", onSelectionChange);
    document.documentElement.appendChild(host);
  }

  function makeDraggable(handle, panel) {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      const dx = e.clientX - rect.left;
      const dy = e.clientY - rect.top;
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const left = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - rect.width);
        const top = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - 40);
        panel.style.left = left + "px";
        panel.style.top = top + "px";
        panel.style.right = "auto";
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
  }

  function setStatus(text, kind) {
    ui.status.textContent = text;
    ui.status.className = "status" + (kind ? " " + kind : "");
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(ui.output.value);
    } catch (err) {
      // No async clipboard (e.g. http:// pages): copy from the selected textarea.
      ui.output.focus();
      ui.output.select();
      if (!document.execCommand("copy")) {
        setStatus("Couldn't copy automatically. Press Ctrl+C.", "error");
        return;
      }
    }
    setStatus("Copied! Paste it back into your document.", "ok");
  }

  function show(message, prefill) {
    if (!host || !host.isConnected) create();
    ui.warning.textContent = message;
    if (prefill) {
      ui.input.value = prefill;
      ui.result.hidden = true;
    }
    setStatus("");
    ui.input.focus();
  }

  function hide() {
    document.removeEventListener("selectionchange", onSelectionChange);
    if (host) host.remove();
    host = null;
    ui = null;
  }

  globalThis.HebEngOverlay = { show, hide };
})();
