// Logging in with a one-time link from the Telegram bot (/login).
//
// The token sits after the # in the link, which a browser never sends to a
// server, and it is only used when the person presses the button. Telegram's
// link preview opens links by itself, and would otherwise use it up first.

import { api } from '../api.js';
import { t } from '../texts.js';
import { esc } from '../format.js';

export function showLinkLogin(root, token, onLoggedIn, onPasswordInstead) {
  root.innerHTML = `
    <section class="login">
      <h2>${esc(t('link.title'))}</h2>
      <p class="lead">${esc(t('link.intro'))}</p>
      <p class="form-error" id="link-error" role="alert" hidden></p>
      <button class="btn" type="button" id="link-go">${esc(t('link.submit'))}</button>
      <p class="hint"><button type="button" class="linkish" id="link-password">${esc(t('link.password'))}</button></p>
    </section>`;

  const go = root.querySelector('#link-go');
  const error = root.querySelector('#link-error');

  go.addEventListener('click', async () => {
    error.hidden = true;
    go.disabled = true;
    go.textContent = t('link.busy');
    try {
      onLoggedIn(await api.post('/api/login/link', { token }));
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
      go.hidden = true;
    }
  });
  root.querySelector('#link-password').addEventListener('click', onPasswordInstead);
  go.focus();
}
