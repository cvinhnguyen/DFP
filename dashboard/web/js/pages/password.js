// Choosing a password with a link from the Telegram bot: /adduser makes an
// account, /password gives anyone a link for their own, and an admin's
// /password email gives a new link for a forgotten one. The person types the
// password here, so it never passes through Telegram or n8n. Someone who has
// only used Telegram has no email yet, and chooses it here too.
//
// As with the login links, the token sits after the # and is used up only
// when the form is sent. Opening the page only asks whose link it is.
// Jira: DM42-33

import { api } from '../api.js';
import { pageTitle, t } from '../texts.js';
import { esc } from '../format.js';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// user: whoever is logged in on this browser already, or null. A link for
// someone else is not offered to them, so an admin who opens the link before
// passing it on cannot use it up by accident.
export function showPassword(root, token, { user, onLoggedIn, onDone }) {
  pageTitle(t('password.title'));
  root.innerHTML = `
    <section class="login">
      <h1>${esc(t('password.title'))}</h1>
      <p class="lead" id="pw-lead">${esc(t('password.checking'))}</p>
      <form id="pw-form" novalidate hidden>
        <label for="pw-email">${esc(t('login.email'))}</label>
        <input id="pw-email" name="email" type="email" autocomplete="username" maxlength="200" readonly>
        <label for="pw-new">${esc(t('password.new'))}</label>
        <input id="pw-new" name="password" type="password" autocomplete="new-password" maxlength="200"
               required aria-describedby="pw-rule">
        <p class="rule" id="pw-rule"></p>
        <label for="pw-again">${esc(t('password.again'))}</label>
        <input id="pw-again" name="again" type="password" autocomplete="new-password" maxlength="200" required>
        <p class="form-error" id="pw-form-error" role="alert" hidden></p>
        <button class="btn" type="submit">${esc(t('password.submit'))}</button>
      </form>
      <p class="form-error" id="pw-error" role="alert" hidden></p>
      <button class="btn" type="button" id="pw-leave" hidden>${esc(t(user ? 'password.back' : 'password.toLogin'))}</button>
    </section>`;

  const lead = root.querySelector('#pw-lead');
  const form = root.querySelector('#pw-form');
  const formError = root.querySelector('#pw-form-error');
  const error = root.querySelector('#pw-error');
  const leave = root.querySelector('#pw-leave');
  const button = form.querySelector('button');
  const { email, password, again } = form.elements;
  let min = 10;
  // Whether the account has no email yet, so the person types one.
  let askEmail = false;

  // The link does not work: say why, and offer the way on.
  function deadLink(message) {
    form.hidden = true;
    lead.hidden = true;
    error.textContent = message;
    error.hidden = false;
    leave.hidden = false;
  }

  function problem(message, field) {
    formError.textContent = message;
    formError.hidden = false;
    field.focus();
  }

  leave.addEventListener('click', onDone);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.hidden = true;
    if (askEmail && !EMAIL.test(email.value.trim())) {
      problem(t('error.bad_login_email'), email);
      return;
    }
    if (password.value.length < min) {
      problem(t('error.weak_password', { n: min }), password);
      return;
    }
    if (password.value !== again.value) {
      problem(t('password.mismatch'), again);
      return;
    }
    button.disabled = true;
    button.textContent = t('password.busy');
    try {
      const body = { token, password: password.value };
      if (askEmail) body.email = email.value.trim();
      onLoggedIn(await api.post('/api/password', body));
    } catch (e) {
      if (e.code === 'bad_password_link') {
        deadLink(e.message);
        return;
      }
      button.disabled = false;
      button.textContent = t('password.submit');
      problem(e.message, ['bad_login_email', 'email_taken'].includes(e.code) ? email : password);
    }
  });

  (async () => {
    let owner;
    try {
      owner = await api.post('/api/password/link', { token });
    } catch (e) {
      deadLink(e.message);
      return;
    }
    // Left while it loaded, for example by switching the language.
    if (!root.contains(form)) return;
    min = owner.min_length || min;
    if (user && user.id !== owner.id) {
      const who = owner.email ? `${owner.name} (${owner.email})` : owner.name;
      lead.textContent = t('password.notYours', { who, you: user.name });
      leave.hidden = false;
      return;
    }
    askEmail = !owner.email;
    const first = owner.name.split(' ')[0];
    lead.textContent = t(askEmail ? 'password.introEmail' : owner.has_password ? 'password.introNew' : 'password.intro',
      { name: first });
    email.value = owner.email || '';
    email.readOnly = !askEmail;
    email.required = askEmail;
    root.querySelector('#pw-rule').textContent = t('password.rule', { n: min });
    form.hidden = false;
    (askEmail ? email : password).focus();
  })();
}
