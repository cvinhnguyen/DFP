// Starts the dashboard: shows a login, or the page the address asks for, and
// goes back to the login whenever a login ends.

import { api } from './api.js';
import { applyTexts, otherLanguage, setLanguage } from './texts.js';
import { esc } from './format.js';
import { showLogin } from './pages/login.js';
import { showLinkLogin } from './pages/link.js';
import { showPassword } from './pages/password.js';
import { showArticles } from './pages/articles.js';
import { showNewsletters } from './pages/newsletters.js';
import { showNewsletter } from './pages/newsletter.js';
import { showSettings } from './pages/settings.js';
import { showArchive } from './pages/archive.js';

// The pages, by the part of the address between # and ?. Each one keeps its
// own settings after the ?, so a reload or a copied link opens the same view.
// nav says which item of the top bar a page belongs under.
const PAGES = {
  articles: { path: '/', show: showArticles, nav: 'articles' },
  newsletters: { path: '/newsletters', show: showNewsletters, nav: 'newsletters' },
  newsletter: { path: '/newsletter', show: showNewsletter, nav: 'newsletters' },
  settings: { path: '/settings', show: showSettings, nav: 'settings' },
  archive: { path: '/archive', show: showArchive, nav: 'newsletters' },
};

// A login link from the bot: http://…/#/link/<token>
const LINK = /^#\/link\/([A-Za-z0-9_-]{20,100})$/;
// A link to choose a password, from /adduser or /password in the bot:
// http://…/#/password/<token>
const PASSWORD = /^#\/password\/([A-Za-z0-9_-]{20,100})$/;

let view = document.getElementById('view');
const who = document.getElementById('who');
const nav = document.getElementById('mainnav');
let user = null;
let linkToken = null;
let passwordToken = null;
let current = null;   // { name, page } on screen, so the page can stop its timers when it goes

function pageFromAddress() {
  const path = location.hash.replace(/^#/, '').split('?')[0] || '/';
  return Object.keys(PAGES).find((name) => PAGES[name].path === path) || 'articles';
}

function setUser(next) {
  user = next;
  who.hidden = !user;
  nav.hidden = !user;
  document.getElementById('who-name').textContent = user ? user.name : '';
  nav.querySelectorAll('[data-admin]').forEach((a) => { a.hidden = !(user && user.role === 'admin'); });
}

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
  render();
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

  document.getElementById('logout').addEventListener('click', async () => {
    try {
      await api.post('/api/logout');
    } catch {
      // Logged out on this side either way.
    }
    setUser(null);
    render();
  });

  document.getElementById('langswitch').addEventListener('click', () => {
    setLanguage(otherLanguage());
    applyTexts(document);
    render();
  });

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
      return;
    }
  }
  render();
}

start();
