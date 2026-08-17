import { ApiError, api } from './api.js';

/** Admin session helpers. CSRF token lives only in memory (never persisted). */
let csrfToken = null;
const STAFF_STATION_STORAGE_KEY = 'sgkiosk.staff.station';
const STAFF_STATIONS = new Set(['launcher', 'cashier', 'kitchen', 'serving']);

export function getStaffStation(fallback = 'launcher') {
  try {
    const stored = sessionStorage.getItem(STAFF_STATION_STORAGE_KEY);
    if (STAFF_STATIONS.has(stored)) return stored;
  } catch {
    // Continue with the route-derived fallback when storage is unavailable.
  }
  return STAFF_STATIONS.has(fallback) ? fallback : 'launcher';
}

function setStaffStation(station) {
  const value = STAFF_STATIONS.has(station) ? station : 'launcher';
  try {
    sessionStorage.setItem(STAFF_STATION_STORAGE_KEY, value);
  } catch {
    // The in-memory request path still carries the station key.
  }
  return value;
}

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

export async function staffLogin(username, password, station = 'launcher') {
  const staffStation = setStaffStation(station);
  const payload = await api.post('/staff/session', { username, password }, { staffStation });
  csrfToken = payload.csrfToken;
  return payload;
}

export async function fetchStaffSession(station = getStaffStation()) {
  const staffStation = getStaffStation(station);
  const payload = await api.get('/staff/session', { staffStation });
  csrfToken = payload.csrfToken;
  return payload;
}

export async function staffLogout(station = getStaffStation()) {
  try {
    await api.delete('/staff/session', { staffStation: getStaffStation(station) });
  } finally {
    csrfToken = null;
  }
}

export async function staffPatch(path, body, station = getStaffStation()) {
  return api.patch(`/staff${path}`, body, {
    csrfToken: getCsrfToken(),
    staffStation: getStaffStation(station),
  });
}

export async function staffGet(path, station) {
  return api.get(path, { staffStation: getStaffStation(station) });
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
