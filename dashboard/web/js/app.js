// Starts the dashboard: shows a login, or the page the address asks for, and
// goes back to the login whenever a login ends.

import { api } from './api.js';
import { applyTexts, otherLanguage, setLanguage } from './texts.js';
import { esc } from './format.js';
import { showLogin } from './pages/login.js';
import { showLinkLogin } from './pages/link.js';
import { showArticles } from './pages/articles.js';
import { showNewsletters } from './pages/newsletters.js';
import { showNewsletter } from './pages/newsletter.js';
import { showSettings } from './pages/settings.js';

// The pages, by the part of the address between # and ?. Each one keeps its
// own settings after the ?, so a reload or a copied link opens the same view.
// nav says which item of the top bar a page belongs under.
const PAGES = {
  articles: { path: '/', show: showArticles, nav: 'articles' },
  newsletters: { path: '/newsletters', show: showNewsletters, nav: 'newsletters' },
  newsletter: { path: '/newsletter', show: showNewsletter, nav: 'newsletters' },
  settings: { path: '/settings', show: showSettings, nav: 'settings' },
};

// A login link from the bot: http://…/#/link/<token>
const LINK = /^#\/link\/([A-Za-z0-9_-]{20,100})$/;

const view = document.getElementById('view');
const who = document.getElementById('who');
const nav = document.getElementById('mainnav');
let user = null;
let linkToken = null;
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

function loggedIn(next) {
  linkToken = null;
  setUser(next);
  render();
}

function render() {
  current?.page?.leave();
  current = null;
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

  const link = location.hash.match(LINK);
  if (link) {
    linkToken = link[1];
    // The token leaves the address straight away, so it is not kept in the
    // browser's history or read over someone's shoulder.
    history.replaceState(null, '', '#/');
  }

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
  // One newsletter's page shows another when the address names another.
  window.addEventListener('hashchange', () => {
    if (!user || !current) return;
    if (pageFromAddress() !== current.name || (current.name === 'newsletter' && location.hash !== current.hash)) render();
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
