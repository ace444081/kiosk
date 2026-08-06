import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from '@kiosk/shared';
import en from './en.json';
import fil from './fil.json';

/**
 * English is the default for every new kiosk session. The kiosk intentionally
 * does NOT persist its locale (per specification); only the admin console
 * persists its own locale separately.
 */
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fil: { translation: fil },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setKioskLocale(locale) {
  i18n.changeLanguage(locale);
  try {
    sessionStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // storage may be unavailable in private mode
  }
}

export function getKioskLocale() {
  try {
    const stored = sessionStorage.getItem(LOCALE_STORAGE_KEY);
    return stored === 'fil' ? 'fil' : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export default i18n;
