# Hebrew/English Layout Fixer

A Brave/Chrome extension (Manifest V3) that fixes text typed in the wrong keyboard layout, converting between Hebrew and English QWERTY **in place**, right inside the text field you're typing in.

Typed `akuo` when you meant `שלום`? Select it, click the extension, choose **English to Hebrew**, and it's fixed.

## Features

- **In-place replacement:** works on the selected text in any `<input>`, `<textarea>`, or `contenteditable` element (WhatsApp Web, Gmail, regular forms, etc.). There's nothing to copy or paste.
- **Both directions:** English → Hebrew and Hebrew → English.
- **Full keyboard mapping:** covers every key from `` ` `` / `Q` to the bottom-right `/`, including the punctuation keys that are easy to get wrong.
- **Uppercase support:** uppercase English letters map to the same Hebrew letters as their lowercase versions.
- **Undo-friendly:** uses `document.execCommand('insertText')`, so Ctrl+Z still works.
- **Works with web frameworks:** if needed, it falls back to setting the value directly and sending `input`/`change` events so React, Angular, and similar apps notice the change.
- **Frames and shadow DOM:** works inside iframes and open shadow roots.
- **Fallback mode:** on sites where in-place editing can't work (Google Docs, Figma, browser code editors…), or when a replacement fails, a floating panel opens on the page. It stays open while you select and copy text on the page: click **Grab selection** (or paste), convert, and the result is copied to your clipboard. You can drag it by its header, and close it with × or Esc.
- **Minimal permissions:** only `activeTab` and `scripting`. The extension can't read any page until you click its icon.

## Installation (unpacked)

1. Clone or download this repository.
2. Open `brave://extensions` (or `chrome://extensions`).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and choose the project folder.
5. Optional: pin the extension from the puzzle-piece menu for quick access.

## Usage

1. Select the incorrectly typed text inside an editable field.
2. Click the extension icon.
3. Click **English to Hebrew** or **Hebrew to English**.

The popup shows how many characters were replaced, then closes.

## Key mapping

Based on the standard Israeli (SI-1452) Hebrew keyboard layout.

| Row    | English → Hebrew |
|--------|------------------|
| Top    | `` ` ``→`;` `q`→`/` `w`→`'` `e`→`ק` `r`→`ר` `t`→`א` `y`→`ט` `u`→`ו` `i`→`ן` `o`→`ם` `p`→`פ` |
| Home   | `a`→`ש` `s`→`ד` `d`→`ג` `f`→`כ` `g`→`ע` `h`→`י` `j`→`ח` `k`→`ל` `l`→`ך` `;`→`ף` `'`→`,` |
| Bottom | `z`→`ז` `x`→`ס` `c`→`ב` `v`→`ה` `b`→`נ` `n`→`מ` `m`→`צ` `,`→`ת` `.`→`ץ` `/`→`.` |

- The Hebrew → English direction is built by reversing this table, so the two directions always match.
- Text is converted one character at a time, so a converted character is never converted again.
- Numbers, spaces, `[ ]`, and other unmapped characters are left unchanged.

## Project structure

```
├── manifest.json        # Manifest V3 configuration
├── src/
│   ├── keymap.js        # Key mapping and convert() function
│   ├── blocklist.js     # Sites that always use fallback mode
│   ├── replacer.js      # Injected into the page; replaces the selection and reports success/failure
│   └── overlay.js       # Injected fallback panel (floating, draggable, shadow DOM)
└── popup/
    ├── popup.html       # In-place buttons; fallback view for the standalone window
    ├── popup.css        # Popup styles (light/dark)
    └── popup.js         # Blocklist check, runs replacer.js, opens the fallback on failure
```

## How it works

1. When the popup opens, it checks the tab's URL against `src/blocklist.js`. Blocklisted and restricted pages go straight to fallback mode.
2. When you click a button, `popup.js` loads `src/keymap.js` and `src/replacer.js` into the active tab (all frames).
3. It then runs `HebEngReplacer.replaceSelection()` in each frame:
   - **Inputs / textareas:** reads `selectionStart`/`selectionEnd`, converts the selected part, and inserts it with `execCommand('insertText')`. If that fails, it sets the value directly and sends `input`/`change` events.
   - **contenteditable:** saves the selection, focuses the editor, restores the selection, and inserts with `execCommand('insertText')`. If that fails, it edits the page directly and sends `beforeinput`/`input` events.
   - Before editing, it refuses selections inside code editors (Monaco, CodeMirror, Ace), in hidden or tiny keystroke-capture elements, or shorter than 2 characters. Afterwards, it checks that the new text is really there.
   - Each frame returns `{ ok: true, count }` or `{ ok: false, reason, text? }`.
4. If no frame succeeded (or `count` is 1 or less), the popup opens fallback mode with a message for that reason, prefilled with the selected text when there is one, and closes itself.

### Fallback mode

A browser popup closes as soon as you click the page, so the fallback can't live in the popup. Instead, `popup.js` injects `src/overlay.js` into the page's top frame, and `HebEngOverlay.show(message, text)` opens a floating panel:

- It's built in a closed shadow root, so the page's CSS can't affect it.
- Keyboard and clipboard events typed into it are stopped at the shadow root, so the page's shortcuts don't react to them.
- **Grab selection** reads the page's current selection, including inside inputs and textareas. If clicking the button cleared the selection, it uses the last one it saw.
- Pages that can't be scripted (`chrome://`, the Web Store, the PDF viewer) get the same UI in a small standalone window instead (`popup.html?standalone=1`), which doesn't close when it loses focus.

## Limitations

- It can't edit restricted pages such as `chrome://`, `brave://`, or the Chrome Web Store. Fallback mode opens in a separate window there.
- On canvas-based apps like Google Docs, **Grab selection** can't see the document's selection. Copy the text with Ctrl+C and paste it into the panel instead.
- It only converts text in place inside editable fields. Selected static page text opens in fallback mode instead.
- A single selected character is never converted in place. Use fallback mode for that.
- `[` and `]` are left unmapped on purpose. The Hebrew layout swaps these brackets because Hebrew is written right to left, so mapping them would cause more confusion than it fixes.

## Development

After you change any file, click the reload ↻ button on the extension's card in `brave://extensions`.

To check the mapping from the command line with Node:

```bash
node -e "require('./src/keymap.js'); console.log(HebEngKeymap.convert('akuo', 'en2he'))"
# → שלום
```
