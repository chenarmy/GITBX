import { defineStore } from 'pinia';
import { ref } from 'vue';
import { locale, setLocale } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { CONFIG_KEYS, persistAppConfig, type ProxyMode } from '@/services/appConfig';

function getInitialTheme(): boolean {
  try {
    const saved = localStorage.getItem(CONFIG_KEYS.theme);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
  } catch {}
  return true; // DBX defaults to its dark desktop workbench
}

export const useSettingsStore = defineStore('settings', () => {
  const isDark = ref<boolean>(getInitialTheme());
  const authorName = ref<string>(localStorage.getItem(CONFIG_KEYS.authorName) || 'Developer');
  const authorEmail = ref<string>(localStorage.getItem(CONFIG_KEYS.authorEmail) || 'dev@gitbx.io');
  const savedProxy = (() => {
    try {
      const value = JSON.parse(localStorage.getItem(CONFIG_KEYS.proxy) || '{}') as Record<string, unknown>;
      return {
        mode: value.mode === 'custom' || value.mode === 'none' ? value.mode as ProxyMode : 'system' as ProxyMode,
        host: typeof value.host === 'string' ? value.host : '',
        port: typeof value.port === 'number' ? value.port : 8080,
        authEnabled: value.authEnabled === true,
        username: typeof value.username === 'string' ? value.username : '',
      };
    } catch {
      return { mode: 'system' as ProxyMode, host: '', port: 8080, authEnabled: false, username: '' };
    }
  })();
  const proxyMode = ref<ProxyMode>(savedProxy.mode);
  const proxyHost = ref<string>(savedProxy.host);
  const proxyPort = ref<number>(savedProxy.port);
  const proxyAuthEnabled = ref<boolean>(savedProxy.authEnabled);
  const proxyUsername = ref<string>(savedProxy.username);
  const isSettingsModalOpen = ref<boolean>(false);
  const skippedVersion = ref<string | null>(localStorage.getItem(CONFIG_KEYS.skippedVersion));
  const savedLastUpdateCheckAt = Number(localStorage.getItem(CONFIG_KEYS.lastUpdateCheckAt));
  const lastUpdateCheckAt = ref<number | null>(
    Number.isFinite(savedLastUpdateCheckAt) && savedLastUpdateCheckAt > 0
      ? savedLastUpdateCheckAt
      : null,
  );

  const language = locale;

  const applyTheme = () => {
    if (isDark.value) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    try {
      localStorage.setItem(CONFIG_KEYS.theme, isDark.value ? 'dark' : 'light');
    } catch {}
    void persistAppConfig().catch(() => undefined);
  };

  const toggleTheme = () => {
    isDark.value = !isDark.value;
    applyTheme();
  };

  const changeLanguage = (nextLocale: Locale) => {
    setLocale(nextLocale);
    void persistAppConfig().catch(() => undefined);
  };

  const persistSettings = async () => {
    localStorage.setItem(CONFIG_KEYS.authorName, authorName.value.trim() || 'Developer');
    localStorage.setItem(CONFIG_KEYS.authorEmail, authorEmail.value.trim() || 'dev@gitbx.io');
    localStorage.setItem(CONFIG_KEYS.proxy, JSON.stringify({
      mode: proxyMode.value,
      host: proxyHost.value.trim(),
      port: proxyPort.value,
      authEnabled: proxyAuthEnabled.value,
      username: proxyUsername.value.trim(),
    }));
    localStorage.setItem(CONFIG_KEYS.theme, isDark.value ? 'dark' : 'light');
    localStorage.setItem(CONFIG_KEYS.locale, language.value);
    if (skippedVersion.value) {
      localStorage.setItem(CONFIG_KEYS.skippedVersion, skippedVersion.value);
    } else {
      localStorage.removeItem(CONFIG_KEYS.skippedVersion);
    }
    if (lastUpdateCheckAt.value !== null) {
      localStorage.setItem(CONFIG_KEYS.lastUpdateCheckAt, String(lastUpdateCheckAt.value));
    }
    await persistAppConfig();
  };

  const setSkippedVersion = async (version: string | null) => {
    skippedVersion.value = version;
    await persistSettings();
  };

  const setLastUpdateCheckAt = async (timestamp: number) => {
    lastUpdateCheckAt.value = timestamp;
    await persistSettings();
  };

  // Apply on startup
  applyTheme();

  return {
    isDark,
    authorName,
    authorEmail,
    proxyMode,
    proxyHost,
    proxyPort,
    proxyAuthEnabled,
    proxyUsername,
    isSettingsModalOpen,
    skippedVersion,
    lastUpdateCheckAt,
    language,
    toggleTheme,
    applyTheme,
    changeLanguage,
    persistSettings,
    setSkippedVersion,
    setLastUpdateCheckAt,
  };
});
