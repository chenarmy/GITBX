import { invoke } from '@tauri-apps/api/core';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/config';
import type { LlmConfig } from '@/types/ai';

export const CONFIG_KEYS = {
  repositories: 'gitbx_managed_repos',
  activeRepository: 'gitbx_active_repo',
  theme: 'gitbx_theme',
  locale: 'gitbx_locale',
  authorName: 'gitbx_author_name',
  authorEmail: 'gitbx_author_email',
  skippedVersion: 'gitbx_update_skipped_version',
  lastUpdateCheckAt: 'gitbx_update_last_check_at',
  ai: 'gitbx_ai_config',
  proxy: 'gitbx_proxy_config',
  sshKey: 'gitbx_ssh_key',
} as const;

interface PersistedRepository {
  path: string;
  name: string;
  lastOpened: number;
}

type PersistedAiConfig = Omit<LlmConfig, 'api_key'>;

export type ProxyMode = 'system' | 'custom' | 'none';

export interface ProxySettings {
  mode: ProxyMode;
  host: string;
  port: number;
  authEnabled: boolean;
  username: string;
}

const DEFAULT_PROXY: ProxySettings = {
  mode: 'system',
  host: '',
  port: 8080,
  authEnabled: false,
  username: '',
};

export interface AppConfig {
  version: 2;
  repositories: {
    items: PersistedRepository[];
    active: string;
  };
  settings: {
    theme: 'dark' | 'light';
    language: Locale;
    authorName: string;
    authorEmail: string;
    proxy: ProxySettings;
    sshKey: string;
  };
  ai: Partial<PersistedAiConfig>;
  updates: {
    skippedVersion: string | null;
    lastCheckAt: number | null;
  };
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const localeCodes = new Set(SUPPORTED_LOCALES.map((item) => item.code));
const aiProviders = new Set(['openai', 'claude', 'deepseek', 'ollama', 'custom']);

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function sanitizeAiConfig(value: unknown): Partial<PersistedAiConfig> {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const config: Partial<PersistedAiConfig> = {};
  if (typeof input.provider === 'string' && aiProviders.has(input.provider)) {
    config.provider = input.provider as PersistedAiConfig['provider'];
  }
  if (typeof input.api_base === 'string') config.api_base = input.api_base;
  if (typeof input.model === 'string') config.model = input.model;
  if (typeof input.temperature === 'number' && Number.isFinite(input.temperature)) {
    config.temperature = input.temperature;
  }
  return config;
}

function sanitizeProxyConfig(value: unknown): ProxySettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PROXY };
  const input = value as Record<string, unknown>;
  const mode = input.mode === 'custom' || input.mode === 'none' ? input.mode : 'system';
  const port = typeof input.port === 'number' && Number.isInteger(input.port)
    ? Math.max(0, Math.min(65535, input.port))
    : DEFAULT_PROXY.port;
  return {
    mode,
    host: typeof input.host === 'string' ? input.host : DEFAULT_PROXY.host,
    port,
    authEnabled: input.authEnabled === true,
    username: typeof input.username === 'string' ? input.username : DEFAULT_PROXY.username,
  };
}

function readLocalConfig(): AppConfig {
  const repositories = parseJson<PersistedRepository[]>(
    localStorage.getItem(CONFIG_KEYS.repositories),
    [],
  ).filter((item) => item && typeof item.path === 'string' && typeof item.name === 'string');
  const ai = sanitizeAiConfig(parseJson<unknown>(localStorage.getItem(CONFIG_KEYS.ai), {}));
  const proxy = sanitizeProxyConfig(parseJson<unknown>(localStorage.getItem(CONFIG_KEYS.proxy), {}));
  const savedLocale = localStorage.getItem(CONFIG_KEYS.locale) as Locale | null;

  return {
    version: 2,
    repositories: {
      items: repositories,
      active: localStorage.getItem(CONFIG_KEYS.activeRepository) || '',
    },
    settings: {
      theme: localStorage.getItem(CONFIG_KEYS.theme) === 'light' ? 'light' : 'dark',
      language: savedLocale && localeCodes.has(savedLocale) ? savedLocale : 'en',
      authorName: localStorage.getItem(CONFIG_KEYS.authorName) || 'Developer',
      authorEmail: localStorage.getItem(CONFIG_KEYS.authorEmail) || 'dev@gitbx.io',
      proxy,
      sshKey: localStorage.getItem(CONFIG_KEYS.sshKey) || '',
    },
    ai,
    updates: {
      skippedVersion: localStorage.getItem(CONFIG_KEYS.skippedVersion) || null,
      lastCheckAt: Number.isFinite(Number(localStorage.getItem(CONFIG_KEYS.lastUpdateCheckAt)))
        && localStorage.getItem(CONFIG_KEYS.lastUpdateCheckAt) !== null
        ? Number(localStorage.getItem(CONFIG_KEYS.lastUpdateCheckAt))
        : null,
    },
  };
}

function normalizeConfig(value: unknown, fallback: AppConfig): AppConfig {
  if (!value || typeof value !== 'object') return fallback;
  const input = value as Partial<AppConfig>;
  const repositoryInput = input.repositories;
  const settingsInput = input.settings;
  const updatesInput = input.updates;
  const items = Array.isArray(repositoryInput?.items)
    ? repositoryInput.items.filter(
        (item) => item && typeof item.path === 'string' && typeof item.name === 'string',
      )
    : fallback.repositories.items;
  const language = settingsInput?.language;

  return {
    version: 2,
    repositories: {
      items,
      active: typeof repositoryInput?.active === 'string'
        ? repositoryInput.active
        : fallback.repositories.active,
    },
    settings: {
      theme: settingsInput?.theme === 'light' ? 'light' : settingsInput?.theme === 'dark'
        ? 'dark'
        : fallback.settings.theme,
      language: language && localeCodes.has(language) ? language : fallback.settings.language,
      authorName: typeof settingsInput?.authorName === 'string'
        ? settingsInput.authorName
        : fallback.settings.authorName,
      authorEmail: typeof settingsInput?.authorEmail === 'string'
        ? settingsInput.authorEmail
        : fallback.settings.authorEmail,
      proxy: settingsInput?.proxy ? sanitizeProxyConfig(settingsInput.proxy) : fallback.settings.proxy,
      sshKey: typeof settingsInput?.sshKey === 'string'
        ? settingsInput.sshKey
        : fallback.settings.sshKey,
    },
    ai: input.ai && typeof input.ai === 'object' ? sanitizeAiConfig(input.ai) : fallback.ai,
    updates: {
      skippedVersion: typeof updatesInput?.skippedVersion === 'string'
        ? updatesInput.skippedVersion
        : fallback.updates.skippedVersion,
      lastCheckAt: typeof updatesInput?.lastCheckAt === 'number'
        && Number.isFinite(updatesInput.lastCheckAt)
        ? updatesInput.lastCheckAt
        : fallback.updates.lastCheckAt,
    },
  };
}

function applyConfig(config: AppConfig) {
  localStorage.setItem(CONFIG_KEYS.repositories, JSON.stringify(config.repositories.items));
  localStorage.setItem(CONFIG_KEYS.activeRepository, config.repositories.active);
  localStorage.setItem(CONFIG_KEYS.theme, config.settings.theme);
  localStorage.setItem(CONFIG_KEYS.locale, config.settings.language);
  localStorage.setItem(CONFIG_KEYS.authorName, config.settings.authorName);
  localStorage.setItem(CONFIG_KEYS.authorEmail, config.settings.authorEmail);
  localStorage.setItem(CONFIG_KEYS.proxy, JSON.stringify(config.settings.proxy));
  localStorage.setItem(CONFIG_KEYS.sshKey, config.settings.sshKey);
  localStorage.setItem(CONFIG_KEYS.ai, JSON.stringify(config.ai));
  if (config.updates.skippedVersion) {
    localStorage.setItem(CONFIG_KEYS.skippedVersion, config.updates.skippedVersion);
  } else {
    localStorage.removeItem(CONFIG_KEYS.skippedVersion);
  }
  if (config.updates.lastCheckAt !== null) {
    localStorage.setItem(CONFIG_KEYS.lastUpdateCheckAt, String(config.updates.lastCheckAt));
  } else {
    localStorage.removeItem(CONFIG_KEYS.lastUpdateCheckAt);
  }
}

let writeQueue: Promise<unknown> = Promise.resolve();

export function persistAppConfig(): Promise<unknown> {
  if (!isTauri()) return Promise.resolve();
  const snapshot = readLocalConfig();
  const write = writeQueue
    .catch(() => undefined)
    .then(() => invoke<string>('save_app_config', { config: snapshot }));
  writeQueue = write;
  return write;
}

export async function initializeAppConfig(): Promise<void> {
  if (!isTauri()) return;
  const localConfig = readLocalConfig();
  try {
    const saved = await invoke<unknown | null>('load_app_config');
    const config = saved ? normalizeConfig(saved, localConfig) : localConfig;
    applyConfig(config);
    await invoke<string>('save_app_config', { config });
  } catch (error) {
    console.error('Failed to initialize user configuration:', error);
  }
}
