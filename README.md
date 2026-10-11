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
│   └── keymap.js        # Key mapping and convert() function
└── popup/
    ├── popup.html       # Popup with the two buttons
    ├── popup.css        # Popup styles (light/dark)
    └── popup.js         # Runs the conversion on the page and replaces the text
```

## How it works

1. When you click a button, `popup.js` loads `src/keymap.js` into the active tab (all frames).
2. It then runs `replaceSelection()` in the page:
   - **Inputs / textareas:** reads `selectionStart`/`selectionEnd`, converts the selected part, and inserts it with `execCommand('insertText')`. If that fails, it sets the value directly and sends `input`/`change` events.
   - **contenteditable:** saves the selection, focuses the editor, restores the selection, and inserts with `execCommand('insertText')`. If that fails, it edits the page directly and sends `beforeinput`/`input` events.

## Limitations

- It can't run on restricted pages such as `chrome://`, `brave://`, or the Chrome Web Store.
- It only converts text inside editable fields, not static page text.
- `[` and `]` are left unmapped on purpose. The Hebrew layout swaps these brackets because Hebrew is written right to left, so mapping them would cause more confusion than it fixes.

## Development

After you change any file, click the reload ↻ button on the extension's card in `brave://extensions`.

To check the mapping from the command line with Node:

```bash
node -e "require('./src/keymap.js'); console.log(HebEngKeymap.convert('akuo', 'en2he'))"
# → שלום
```
