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
  ai: 'gitbx_ai_config',
} as const;

interface PersistedRepository {
  path: string;
  name: string;
  lastOpened: number;
}

type PersistedAiConfig = Omit<LlmConfig, 'api_key'>;

export interface AppConfig {
  version: 1;
  repositories: {
    items: PersistedRepository[];
    active: string;
  };
  settings: {
    theme: 'dark' | 'light';
    language: Locale;
    authorName: string;
    authorEmail: string;
  };
  ai: Partial<PersistedAiConfig>;
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

function readLocalConfig(): AppConfig {
  const repositories = parseJson<PersistedRepository[]>(
    localStorage.getItem(CONFIG_KEYS.repositories),
    [],
  ).filter((item) => item && typeof item.path === 'string' && typeof item.name === 'string');
  const ai = sanitizeAiConfig(parseJson<unknown>(localStorage.getItem(CONFIG_KEYS.ai), {}));
  const savedLocale = localStorage.getItem(CONFIG_KEYS.locale) as Locale | null;

  return {
    version: 1,
    repositories: {
      items: repositories,
      active: localStorage.getItem(CONFIG_KEYS.activeRepository) || '',
    },
    settings: {
      theme: localStorage.getItem(CONFIG_KEYS.theme) === 'light' ? 'light' : 'dark',
      language: savedLocale && localeCodes.has(savedLocale) ? savedLocale : 'en',
      authorName: localStorage.getItem(CONFIG_KEYS.authorName) || 'Developer',
      authorEmail: localStorage.getItem(CONFIG_KEYS.authorEmail) || 'dev@gitbx.io',
    },
    ai,
  };
}

function normalizeConfig(value: unknown, fallback: AppConfig): AppConfig {
  if (!value || typeof value !== 'object') return fallback;
  const input = value as Partial<AppConfig>;
  const repositoryInput = input.repositories;
  const settingsInput = input.settings;
  const items = Array.isArray(repositoryInput?.items)
    ? repositoryInput.items.filter(
        (item) => item && typeof item.path === 'string' && typeof item.name === 'string',
      )
    : fallback.repositories.items;
  const language = settingsInput?.language;

  return {
    version: 1,
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
    },
    ai: input.ai && typeof input.ai === 'object' ? sanitizeAiConfig(input.ai) : fallback.ai,
  };
}

function applyConfig(config: AppConfig) {
  localStorage.setItem(CONFIG_KEYS.repositories, JSON.stringify(config.repositories.items));
  localStorage.setItem(CONFIG_KEYS.activeRepository, config.repositories.active);
  localStorage.setItem(CONFIG_KEYS.theme, config.settings.theme);
  localStorage.setItem(CONFIG_KEYS.locale, config.settings.language);
  localStorage.setItem(CONFIG_KEYS.authorName, config.settings.authorName);
  localStorage.setItem(CONFIG_KEYS.authorEmail, config.settings.authorEmail);
  localStorage.setItem(CONFIG_KEYS.ai, JSON.stringify(config.ai));
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
