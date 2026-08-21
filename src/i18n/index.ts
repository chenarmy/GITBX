import { computed, ref } from 'vue';
import { DEFAULT_LOCALE, messages, type Locale } from './config';

const LOCALE_KEY = 'gitbx_locale';
const RTL_LOCALES: Locale[] = ['ar'];

function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY) as Locale | null;
    if (saved && saved in messages) return saved;
  } catch {
    // localStorage is unavailable in some webview startup states.
  }
  return DEFAULT_LOCALE;
}

export const locale = ref<Locale>(getInitialLocale());

export function setLocale(nextLocale: Locale) {
  locale.value = nextLocale;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = RTL_LOCALES.includes(nextLocale) ? 'rtl' : 'ltr';
  }
  try {
    localStorage.setItem(LOCALE_KEY, nextLocale);
  } catch {
    // Locale still applies for the current session.
  }
}

function interpolate(value: string, params?: Record<string, string | number>) {
  if (!params) return value;
  return Object.entries(params).reduce(
    (result, [key, replacement]) => result.split(`{${key}}`).join(String(replacement)),
    value,
  );
}

export function t(key: string, params?: Record<string, string | number>): string {
  const translated = messages[locale.value][key] ?? messages[DEFAULT_LOCALE][key] ?? key;
  return interpolate(translated, params);
}

export function useI18n() {
  return {
    locale,
    isRtl: computed(() => RTL_LOCALES.includes(locale.value)),
    t,
    setLocale,
  };
}

setLocale(locale.value);
