import { api } from './api.js';

/**
 * Menu service with an in-memory cache: the latest successful response is
 * kept so the kiosk can still render the menu when the server is unreachable
 * (checkout stays disabled - enforced by the UI).
 */
let cachedMenu = null;
let cachedLocale = null;
let cachedAt = null;

export async function fetchMenu(locale = 'en', { force = false } = {}) {
  if (!force && cachedMenu && cachedLocale === locale) {
    return { menu: cachedMenu, stale: false, cached: true };
  }
  try {
    const menu = await api.get(`/menu?locale=${encodeURIComponent(locale)}`);
    cachedMenu = menu;
    cachedLocale = locale;
    cachedAt = Date.now();
    return { menu, stale: false, cached: false };
  } catch (err) {
    if (cachedMenu && cachedLocale === locale) {
      return { menu: cachedMenu, stale: true, cached: true, error: err };
    }
    throw err;
  }
}

export function getCachedMenuAge() {
  return cachedAt ? Date.now() - cachedAt : null;
}

export function clearMenuCache() {
  cachedMenu = null;
  cachedLocale = null;
  cachedAt = null;
}
