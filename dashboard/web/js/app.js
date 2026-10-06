// Starts the dashboard: shows a login, or the page the address asks for, and
// goes back to the login whenever a login ends.

import { api } from './api.js';
import { startLive, stopLive } from './live.js';
import { applyTexts, currentLanguage, otherLanguage, setLanguage, t } from './texts.js';
import { currentTheme, setTheme, THEMES } from './appearance.js';
import { menuButton } from './ui/menu.js';
import { esc } from './format.js';
import { showLogin } from './pages/login.js';
import { showLinkLogin } from './pages/link.js';
import { showPassword } from './pages/password.js';
import { showArticles } from './pages/articles.js';
import { showNewsletters } from './pages/newsletters.js';
import { showNewsletter } from './pages/newsletter.js';
import { showSettings } from './pages/settings.js';
import { showArchive } from './pages/archive.js';
import { showSources } from './pages/sources.js';

// The pages, by the part of the address between # and ?. Each one keeps its
// own settings after the ?, so a reload or a copied link opens the same view.
// nav says which item of the top bar a page belongs under.
const PAGES = {
  articles: { path: '/', show: showArticles, nav: 'articles' },
  newsletters: { path: '/newsletters', show: showNewsletters, nav: 'newsletters' },
  newsletter: { path: '/newsletter', show: showNewsletter, nav: 'newsletters' },
  settings: { path: '/settings', show: showSettings, nav: 'settings' },
  archive: { path: '/archive', show: showArchive, nav: 'newsletters' },
  sources: { path: '/sources', show: showSources, nav: 'settings' },
};

// A login link from the bot: http://…/#/link/<token>
const LINK = /^#\/link\/([A-Za-z0-9_-]{20,100})$/;
// A link to choose a password, from /adduser or /password in the bot:
// http://…/#/password/<token>
const PASSWORD = /^#\/password\/([A-Za-z0-9_-]{20,100})$/;

let view = document.getElementById('view');
const usermenu = document.getElementById('usermenu');
const langswitch = document.getElementById('langswitch');
const nav = document.getElementById('mainnav');
let user = null;
let linkToken = null;
let passwordToken = null;
let current = null;   // { name, page } on screen, so the page can stop its timers when it goes

function pageFromAddress() {
  const path = location.hash.replace(/^#/, '').split('?')[0] || '/';
  return Object.keys(PAGES).find((name) => PAGES[name].path === path) || 'articles';
}

// VN for Vinh Nguyen, UX for UX-testaaja.
function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase();
}

function setUser(next) {
  user = next;
  // Changes reach the open pages as they happen while someone is logged in.
  if (user) startLive();
  else stopLive();
  // Logged in, the language is in the user's menu; on the login page it is
  // a button of its own.
  usermenu.hidden = !user;
  langswitch.hidden = Boolean(user);
  nav.hidden = !user;
  document.getElementById('who-name').textContent = user ? user.name : '';
  document.getElementById('user-avatar').textContent = user ? initials(user.name) : '';
  if (user) usermenu.setAttribute('aria-label', t('menu.user', { name: user.name }));
  nav.querySelectorAll('[data-admin]').forEach((a) => { a.hidden = !(user && user.role === 'admin'); });
}

function switchLanguage(next) {
  setLanguage(next);
  applyTexts(document);
  if (user) usermenu.setAttribute('aria-label', t('menu.user', { name: user.name }));
  render();
}

async function logOut() {
  try {
    await api.post('/api/logout');
  } catch {
    // Logged out on this side either way.
  }
  setUser(null);
  render();
}

// Who is logged in, the look of the pages, the language, and logging out:
// one menu under the name, instead of three things in the top bar.
const THEME_ICONS = { system: 'monitor', light: 'sun', dark: 'moon' };
menuButton(usermenu, () => [
  { kind: 'head', title: user?.name || '', sub: user?.email || '' },
  { kind: 'group', label: t('menu.appearance'), options: THEMES.map((theme) => ({
    label: t(`theme.${theme}`), icon: THEME_ICONS[theme], checked: currentTheme() === theme,
    onSelect: () => setTheme(theme),
  })) },
  { kind: 'group', label: t('menu.language'), options: [['fi', 'Suomi'], ['en', 'English']].map(([code, label]) => ({
    label, lang: code, checked: currentLanguage() === code, onSelect: () => switchLanguage(code),
  })) },
  { kind: 'separator' },
  { kind: 'item', label: t('header.logout'), icon: 'logout', onSelect: logOut },
]);

// A link from the bot opened in the address bar. The token leaves the
// address straight away, so it is not kept in the browser's history or read
// over someone's shoulder. The password page stays at #/password, so the top
// bar can still lead away from it.
function takeLink() {
  const link = location.hash.match(LINK);
  const password = location.hash.match(PASSWORD);
  if (link) {
    linkToken = link[1];
    history.replaceState(null, '', '#/');
  } else if (password) {
    passwordToken = password[1];
    history.replaceState(null, '', '#/password');
  }
  return Boolean(link || password);
}

function forgetLinks() {
  linkToken = null;
  passwordToken = null;
  if (location.hash === '#/password') history.replaceState(null, '', '#/');
}

function loggedIn(next) {
  forgetLinks();
  setUser(next);
  showSplash();
  render();
  splashUntilReady(900);
}

// The association's logo while the app starts, and for a moment after
// logging in (at least `least` ms), until the page shown first has what it
// shows: something in it and nothing in it busy any more. At most six
// seconds, so a slow page is never hidden behind it.
const splash = document.getElementById('splash');

function showSplash() {
  splash.hidden = false;
  splash.classList.remove('out');
}

function hideSplash() {
  if (splash.hidden) return;
  splash.classList.add('out');
  setTimeout(() => {
    if (splash.classList.contains('out')) splash.hidden = true;
  }, 260);
}

function pageReady(most) {
  const ready = () => {
    const page = document.getElementById('view');
    return page && page.children.length > 0 && !page.querySelector('[aria-busy="true"], p.loading');
  };
  return new Promise((resolve) => {
    let observer = null;
    let timer = null;
    const done = () => {
      clearTimeout(timer);
      if (observer) observer.disconnect();
      resolve();
    };
    if (ready()) {
      done();
      return;
    }
    timer = setTimeout(done, most);
    observer = new MutationObserver(() => {
      if (ready()) done();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy'] });
  });
}

async function splashUntilReady(least = 0) {
  const started = Date.now();
  await pageReady(6000);
  const left = least - (Date.now() - started);
  if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
  hideSplash();
}

// Every page listens for clicks on the element it draws into. Each page gets
// a new one, so the listeners of the pages shown before go with the old
// element: without this, coming back to a page made one click count twice.
function freshView() {
  const next = view.cloneNode(false);
  view.replaceWith(next);
  view = next;
}

function render() {
  current?.page?.leave();
  current = null;
  freshView();
  // Whether or not someone is logged in: the page checks whose link it is.
  if (passwordToken) {
    nav.querySelectorAll('[data-page]').forEach((a) => a.removeAttribute('aria-current'));
    showPassword(view, passwordToken, {
      user,
      onLoggedIn: loggedIn,
      onDone: () => {
        forgetLinks();
        render();
      },
    });
    return;
  }
  if (!user && linkToken) {
    showLinkLogin(view, linkToken, loggedIn, () => {
      linkToken = null;
      render();
    });
    return;
  }
  if (!user) {
    showLogin(view, loggedIn);
    return;
  }
  // Someone already logged in who opens a link stays logged in, and the link
  // stays unused.
  linkToken = null;
  const name = pageFromAddress();
  nav.querySelectorAll('[data-page]').forEach((a) => {
    if (a.dataset.page === PAGES[name].nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  current = { name, hash: location.hash, page: PAGES[name].show(view, { user }) };
}

async function start() {
  applyTexts(document);

  takeLink();

  langswitch.addEventListener('click', () => switchLanguage(otherLanguage()));

  // A page handles changes to its own settings after the ?. Moving to another
  // page is handled here.
  // One newsletter's page shows another when the address names another, and
  // so does the archive's.
  window.addEventListener('hashchange', () => {
    if (takeLink()) {
      render();
      return;
    }
    if (passwordToken && location.hash !== '#/password') {
      forgetLinks();
      render();
      return;
    }
    if (!user || !current) return;
    if (pageFromAddress() !== current.name
      || (['newsletter', 'archive'].includes(current.name) && location.hash !== current.hash)) render();
  });

  window.addEventListener('auth-lost', () => {
    if (!user) return;
    setUser(null);
    render();
  });

  try {
    setUser(await api.get('/api/me'));
  } catch (e) {
    if (e.status !== 401) {
      view.innerHTML = `<p class="problem">${esc(e.message)}</p>`;
      hideSplash();
      return;
    }
  }
  render();
  if (user) splashUntilReady();
  else hideSplash();
}

start();
