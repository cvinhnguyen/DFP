// The login form. Accounts are made by an admin, so there is no sign-up and
// no "forgot password" link: /password in the Telegram bot gives a link to
// choose a new one, and an admin can send one too (pages/password.js).

import { api } from '../api.js';
import { pageTitle, t } from '../texts.js';
import { esc } from '../format.js';

export function showLogin(root, onLoggedIn) {
  pageTitle(t('login.title'));
  root.innerHTML = `
    <section class="login">
      <h1>${esc(t('login.title'))}</h1>
      <form id="login-form" novalidate>
        <label for="login-email">${esc(t('login.email'))}</label>
        <input id="login-email" name="email" type="email" autocomplete="username" required>
        <label for="login-password">${esc(t('login.password'))}</label>
        <input id="login-password" name="password" type="password" autocomplete="current-password" required>
        <p class="form-error" id="login-error" role="alert" hidden></p>
        <button class="btn" type="submit">${esc(t('login.submit'))}</button>
      </form>
      <p class="hint">${esc(t('login.hint'))}</p>
    </section>`;

  const form = root.querySelector('#login-form');
  const error = root.querySelector('#login-error');
  const button = form.querySelector('button');
  const { email, password } = form.elements;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    button.disabled = true;
    button.textContent = t('login.busy');
    try {
      onLoggedIn(await api.post('/api/login', { email: email.value, password: password.value }));
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
      password.value = '';
      password.focus();
      button.disabled = false;
      button.textContent = t('login.submit');
    }
  });

  email.focus();
}
