// Light, dark, or as the computer has it: the choice in the user menu. The
// colours for each are tokens in base.css; this only says which apply, by
// data-theme on the page, as js/theme.js does before the page is drawn.
// Jira: DM42-80

const KEY = 'dfp.theme';
export const THEMES = ['system', 'light', 'dark'];

export function currentTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (THEMES.includes(saved)) return saved;
  } catch {
    // Storage blocked.
  }
  return 'system';
}

export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
}
