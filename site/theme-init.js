/* Applies a saved theme choice before first paint. No saved choice: the CSS follows the system setting. */
(function () {
  try {
    var t = localStorage.getItem('memex-site-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
