// Standard Israeli (SI-1452) Hebrew keyboard layout vs. US English QWERTY.
// Loaded both by the popup and injected into the page (isolated world).
(function () {
  // Physical key (English char) -> character produced in Hebrew layout.
  const EN_TO_HE = {
    // Top row
    "`": ";",
    q: "/", w: "'", e: "ק", r: "ר", t: "א", y: "ט", u: "ו", i: "ן", o: "ם", p: "פ",
    // Home row
    a: "ש", s: "ד", d: "ג", f: "כ", g: "ע", h: "י", j: "ח", k: "ל", l: "ך",
    ";": "ף", "'": ",",
    // Bottom row
    z: "ז", x: "ס", c: "ב", v: "ה", b: "נ", n: "מ", m: "צ",
    ",": "ת", ".": "ץ", "/": "."
  };

  const enToHe = {};
  const heToEn = {};
  for (const [en, he] of Object.entries(EN_TO_HE)) {
    enToHe[en] = he;
    // Uppercase English letters map to the same Hebrew character.
    if (en.toUpperCase() !== en) enToHe[en.toUpperCase()] = he;
    heToEn[he] = en;
  }

  // Single pass, character by character, so mappings never chain
  // (e.g. "/" -> "." must not then become "ץ"). Unmapped chars pass through.
  function convert(text, direction) {
    const map = direction === "he2en" ? heToEn : enToHe;
    let out = "";
    for (const ch of text) out += Object.prototype.hasOwnProperty.call(map, ch) ? map[ch] : ch;
    return out;
  }

  globalThis.HebEngKeymap = { convert, enToHe, heToEn };
})();
