// Talking to the dashboard's own API. Requests and answers are JSON. When a
// login has ended, the page is told, so it can show the login form again
// instead of an error.

import { t, has } from './texts.js';

export class ApiError extends Error {
  constructor(status, message, code = null, params = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

const NOT_ABOUT_THE_LOGIN = ['/api/login', '/api/password', '/api/password/link'];

async function call(method, path, body) {
  const options = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new ApiError(0, t('error.network'));
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    // The API names each error with a code; the page says it in its own
    // language and falls back to the API's English message.
    const code = data?.code ? `error.${data.code}` : null;
    const message = code && has(code)
      ? t(code, data.params || {})
      : (typeof data?.detail === 'string' ? data.detail : t('error.server', { status: response.status }));
    // A wrong password or a used link says nothing about the login on this
    // browser, which may well be fine.
    if (response.status === 401 && !NOT_ABOUT_THE_LOGIN.includes(path)) {
      window.dispatchEvent(new CustomEvent('auth-lost'));
    }
    throw new ApiError(response.status, message, data?.code || null, data?.params || {});
  }
  return data;
}

export const api = {
  get(path, params) {
    // Values left empty are left out, not sent as the word "undefined".
    const kept = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
    const query = kept.length ? `?${new URLSearchParams(kept)}` : '';
    return call('GET', path + query);
  },
  post(path, body = {}) {
    return call('POST', path, body);
  },
  put(path, body = {}) {
    return call('PUT', path, body);
  },
  patch(path, body = {}) {
    return call('PATCH', path, body);
  },
  del(path) {
    return call('DELETE', path);
  },
};
