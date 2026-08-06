import { ApiError, api } from './api.js';

/** Admin session helpers. CSRF token lives only in memory (never persisted). */
let csrfToken = null;

export async function fetchAdminSession() {
  const payload = await api.get('/admin/session');
  csrfToken = payload.csrfToken;
  return payload;
}

export async function adminLogin(username, password) {
  const payload = await api.post('/admin/session', { username, password });
  csrfToken = payload.csrfToken;
  return payload;
}

export async function staffLogin(username, password) {
  const payload = await api.post('/staff/session', { username, password });
  csrfToken = payload.csrfToken;
  return payload;
}

export async function fetchStaffSession() {
  const payload = await api.get('/staff/session');
  csrfToken = payload.csrfToken;
  return payload;
}

export async function staffLogout() {
  try {
    await api.delete('/staff/session');
  } finally {
    csrfToken = null;
  }
}

export async function staffPatch(path, body) {
  return api.patch(`/staff${path}`, body, { csrfToken: getCsrfToken() });
}

export async function adminLogout() {
  try {
    await api.delete('/admin/session');
  } finally {
    csrfToken = null;
  }
}

export function getCsrfToken() {
  return csrfToken;
}

/** Mutations include the CSRF header automatically. */
export async function adminPatch(path, body) {
  return api.patch(path, body, { csrfToken: getCsrfToken() });
}

export async function adminPost(path, body) {
  return api.post(path, body, { csrfToken: getCsrfToken() });
}

/** Download an authenticated admin export while preserving the shared error format. */
export async function adminDownload(path) {
  let response;
  try {
    response = await fetch(`/api/v1${path}`, { credentials: 'same-origin' });
  } catch {
    throw new ApiError({ code: 'NETWORK_ERROR', message: 'Cannot reach the server', status: 0 });
  }
  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    throw new ApiError({
      code: payload?.error?.code || 'GENERIC',
      message: payload?.error?.message || `Request failed (${response.status})`,
      fieldErrors: payload?.error?.fieldErrors,
      status: response.status,
      requestId: payload?.requestId,
      product: payload?.product,
    });
  }
  return {
    blob: await response.blob(),
    filename: response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1],
  };
}
