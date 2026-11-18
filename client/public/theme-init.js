/* Sets the theme before first paint (same rule as src/lib/theme.ts): the saved choice, else the system setting.
   A separate file, not an inline script: the server's Content-Security-Policy only allows scripts from 'self'. */
(function () {
  var t = 'dark';
  try {
    var saved = localStorage.getItem('memex-theme');
    if (saved === 'light' || saved === 'dark') t = saved;
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) t = 'light';
  } catch (e) {}
  document.documentElement.setAttribute('data-theme', t);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'light' ? '#F5F7FB' : '#0B0E14');
})();
