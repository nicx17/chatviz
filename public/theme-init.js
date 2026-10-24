// Applies the saved theme before first paint, so a light theme doesn't
// flash dark on load. Kept outside the bundle because the CSP forbids inline
// scripts. src/theme.js owns the setting and re-validates it.
try {
  var saved = JSON.parse(localStorage.getItem('chatviz-appearance') || '{}');
  if (typeof saved.theme === 'string') document.documentElement.dataset.theme = saved.theme;
  if (typeof saved.accent === 'string') document.documentElement.dataset.accent = saved.accent;
} catch (e) {
  // Storage blocked: the default theme applies
}
