// The look chosen in the user menu, light or dark, put on the page before it
// is drawn, so it never flashes the other one first. Without a choice the
// page follows the computer's own setting (base.css). Kept in this browser
// only. A plain script rather than a module, so it runs at once.
// Jira: DM42-80
(function () {
  try {
    var chosen = localStorage.getItem('dfp.theme');
    if (chosen === 'light' || chosen === 'dark') document.documentElement.setAttribute('data-theme', chosen);
  } catch (e) {
    // Storage blocked: the computer's setting, every time.
  }
}());
