// Sites where in-place replacement can't work: they draw text on a canvas or
// capture keystrokes through a hidden input, so the real selection is not in
// the DOM. The popup goes straight to manual (paste & copy) mode on these.
(function () {
  // Matches the hostname itself and any subdomain of it.
  const BLOCKED_HOSTS = [
    "docs.google.com",       // Docs / Sheets / Slides (canvas rendering)
    "figma.com",
    "canva.com",
    "miro.com",
    "excalidraw.com",
    "github.dev",            // VS Code in the browser (Monaco)
    "vscode.dev",
    "codesandbox.io",
    "stackblitz.com",
    "replit.com",
    "codepen.io",
    "jsfiddle.net",
    "officeapps.live.com",   // Word / Excel / PowerPoint for the web
    "onlyoffice.com"
  ];

  function isBlocked(url) {
    let host;
    try { host = new URL(url).hostname; } catch (e) { return false; }
    return BLOCKED_HOSTS.some((d) => host === d || host.endsWith("." + d));
  }

  globalThis.HebEngBlocklist = { isBlocked, BLOCKED_HOSTS };
})();
