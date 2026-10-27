import { invoke } from '@tauri-apps/api/core';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/config';
import type { LlmConfig, AiProviderConfig } from '@/types/ai';
import { clampFontSize, defaultFontIdForLocale, isKnownFontId } from '@/services/fonts';

export const CONFIG_KEYS = {
  repositories: 'gitbx_managed_repos',
  repositoryGroups: 'gitbx_repo_groups',
  activeRepository: 'gitbx_active_repo',
  theme: 'gitbx_theme',
  locale: 'gitbx_locale',
  authorName: 'gitbx_author_name',
  authorEmail: 'gitbx_author_email',
  skippedVersion: 'gitbx_update_skipped_version',
  lastUpdateCheckAt: 'gitbx_update_last_check_at',
  ai: 'gitbx_ai_config',
  aiProviders: 'gitbx_ai_providers',
  aiSessions: 'gitbx_ai_sessions',
  aiActiveSession: 'gitbx_ai_active_session',
  aiSelectedModel: 'gitbx_ai_selected_model',
  aiSelectedProvider: 'gitbx_ai_selected_provider',
  aiSidebarVisible: 'gitbx_ai_sidebar_visible',
  aiMode: 'gitbx_ai_mode',
  proxy: 'gitbx_proxy_config',
  sshKey: 'gitbx_ssh_key',
  webToken: 'gitbx_web_token',
  fontId: 'gitbx_font_id',
  fontSize: 'gitbx_font_size',
  monoFontId: 'gitbx_mono_font_id',
} as const;

interface PersistedRepository {
  path: string;
  name: string;
  lastOpened: number;
  group?: string;
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
    groups?: string[];
  };
  settings: {
    theme: 'dark' | 'light';
    language: Locale;
    authorName: string;
    authorEmail: string;
    proxy: ProxySettings;
    sshKey: string;
    fontId: string;
    fontSize: number;
    monoFontId: string;
  };
  ai: Partial<PersistedAiConfig>;
  aiProviders?: AiProviderConfig[];
  aiSelectedProvider?: string;
  aiSelectedModel?: string;
  updates: {
    skippedVersion: string | null;
    lastCheckAt: number | null;
  };
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const localeCodes = new Set(SUPPORTED_LOCALES.map((item) => item.code));

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
  if (typeof input.provider === 'string' && input.provider.trim()) {
    config.provider = input.provider.trim() as any;
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

function sanitizeFontSettings(
  value: { fontId?: unknown; fontSize?: unknown; monoFontId?: unknown },
  language: Locale,
): { fontId: string; fontSize: number; monoFontId: string } {
  const fallbackId = defaultFontIdForLocale(language);
  const fontId = typeof value.fontId === 'string' && isKnownFontId(value.fontId)
    ? value.fontId
    : fallbackId;
  const monoFontId = typeof value.monoFontId === 'string' && isKnownFontId(value.monoFontId)
    ? value.monoFontId
    : 'system-mono';
  return {
    fontId,
    fontSize: clampFontSize(
      typeof value.fontSize === 'string' ? Number(value.fontSize) : value.fontSize,
    ),
    monoFontId,
  };
}

function sanitizeGroupList(groups: unknown, items: PersistedRepository[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const addGroup = (value: unknown) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  };
  if (Array.isArray(groups)) {
    groups.forEach(addGroup);
  }
  items.forEach((item) => addGroup(item.group));
  return result;
}

export function readLocalConfig(): AppConfig {
  const repositories = parseJson<PersistedRepository[]>(
    localStorage.getItem(CONFIG_KEYS.repositories),
    [],
  )
    .filter((item) => item && typeof item.path === 'string' && typeof item.name === 'string')
    .map((item) => ({
      ...item,
      group: typeof item.group === 'string' && item.group.trim() ? item.group.trim() : undefined,
    }));
  const repositoryGroups = sanitizeGroupList(
    parseJson<unknown>(localStorage.getItem(CONFIG_KEYS.repositoryGroups), []),
    repositories,
  );
  const ai = sanitizeAiConfig(parseJson<unknown>(localStorage.getItem(CONFIG_KEYS.ai), {}));
  const proxy = sanitizeProxyConfig(parseJson<unknown>(localStorage.getItem(CONFIG_KEYS.proxy), {}));
  const savedLocale = localStorage.getItem(CONFIG_KEYS.locale) as Locale | null;
  const language: Locale = savedLocale && localeCodes.has(savedLocale) ? savedLocale : 'en';
  const font = sanitizeFontSettings(
    {
      fontId: localStorage.getItem(CONFIG_KEYS.fontId),
      fontSize: localStorage.getItem(CONFIG_KEYS.fontSize),
      monoFontId: localStorage.getItem(CONFIG_KEYS.monoFontId),
    },
    language,
  );

  const rawAiProviders = parseJson<AiProviderConfig[] | null>(
    localStorage.getItem(CONFIG_KEYS.aiProviders),
    null,
  );
  const aiProviders = Array.isArray(rawAiProviders)
    ? rawAiProviders.map((p) => ({ ...p, api_key: '' }))
    : undefined;
  const aiSelectedProvider = localStorage.getItem(CONFIG_KEYS.aiSelectedProvider) || (ai.provider as string) || undefined;
  const aiSelectedModel = localStorage.getItem(CONFIG_KEYS.aiSelectedModel) || (ai.model as string) || undefined;

  return {
    version: 2,
    repositories: {
      items: repositories,
      active: localStorage.getItem(CONFIG_KEYS.activeRepository) || '',
      groups: repositoryGroups,
    },
    settings: {
      theme: localStorage.getItem(CONFIG_KEYS.theme) === 'light' ? 'light' : 'dark',
      language: savedLocale && localeCodes.has(savedLocale) ? savedLocale : 'en',
      authorName: localStorage.getItem(CONFIG_KEYS.authorName) || 'Developer',
      authorEmail: localStorage.getItem(CONFIG_KEYS.authorEmail) || 'dev@gitbx.io',
      proxy,
      sshKey: localStorage.getItem(CONFIG_KEYS.sshKey) || '',
      fontId: font.fontId,
      fontSize: font.fontSize,
      monoFontId: font.monoFontId,
    },
    ai,
    aiProviders,
    aiSelectedProvider,
    aiSelectedModel,
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
    ? repositoryInput.items
        .filter((item) => item && typeof item.path === 'string' && typeof item.name === 'string')
        .map((item) => ({
          ...item,
          group: typeof item.group === 'string' && item.group.trim() ? item.group.trim() : undefined,
        }))
    : fallback.repositories.items;
  const groups = sanitizeGroupList(
    Array.isArray(repositoryInput?.groups) ? repositoryInput?.groups : fallback.repositories.groups,
    items,
  );
  const language = settingsInput?.language;

  const aiProviders = Array.isArray(input.aiProviders)
    ? input.aiProviders.map((p) => ({ ...p, api_key: '' }))
    : fallback.aiProviders;
  const aiSelectedProvider = typeof input.aiSelectedProvider === 'string'
    ? input.aiSelectedProvider
    : (typeof input.ai?.provider === 'string' ? input.ai.provider : fallback.aiSelectedProvider);
  const aiSelectedModel = typeof input.aiSelectedModel === 'string'
    ? input.aiSelectedModel
    : (typeof input.ai?.model === 'string' ? input.ai.model : fallback.aiSelectedModel);

  return {
    version: 2,
    repositories: {
      items,
      active: typeof repositoryInput?.active === 'string'
        ? repositoryInput.active
        : fallback.repositories.active,
      groups,
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
      ...sanitizeFontSettings(
        {
          fontId: (settingsInput as Record<string, unknown> | undefined)?.fontId ?? fallback.settings.fontId,
          fontSize: (settingsInput as Record<string, unknown> | undefined)?.fontSize ?? fallback.settings.fontSize,
          monoFontId: (settingsInput as Record<string, unknown> | undefined)?.monoFontId ?? fallback.settings.monoFontId,
        },
        language && localeCodes.has(language) ? language : fallback.settings.language,
      ),
    },
    ai: input.ai && typeof input.ai === 'object' ? sanitizeAiConfig(input.ai) : fallback.ai,
    aiProviders,
    aiSelectedProvider,
    aiSelectedModel,
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

export function applyConfig(config: AppConfig) {
  localStorage.setItem(CONFIG_KEYS.repositories, JSON.stringify(config.repositories.items));
  localStorage.setItem(
    CONFIG_KEYS.repositoryGroups,
    JSON.stringify(sanitizeGroupList(config.repositories.groups, config.repositories.items)),
  );
  localStorage.setItem(CONFIG_KEYS.activeRepository, config.repositories.active);
  localStorage.setItem(CONFIG_KEYS.theme, config.settings.theme);
  localStorage.setItem(CONFIG_KEYS.locale, config.settings.language);
  localStorage.setItem(CONFIG_KEYS.authorName, config.settings.authorName);
  localStorage.setItem(CONFIG_KEYS.authorEmail, config.settings.authorEmail);
  localStorage.setItem(CONFIG_KEYS.proxy, JSON.stringify(config.settings.proxy));
  localStorage.setItem(CONFIG_KEYS.sshKey, config.settings.sshKey);
  localStorage.setItem(CONFIG_KEYS.fontId, config.settings.fontId);
  localStorage.setItem(CONFIG_KEYS.fontSize, String(config.settings.fontSize));
  localStorage.setItem(CONFIG_KEYS.monoFontId, config.settings.monoFontId);
  localStorage.setItem(CONFIG_KEYS.ai, JSON.stringify(config.ai));

  if (config.aiProviders && config.aiProviders.length > 0) {
    localStorage.setItem(CONFIG_KEYS.aiProviders, JSON.stringify(config.aiProviders));
  }
  if (config.aiSelectedProvider) {
    localStorage.setItem(CONFIG_KEYS.aiSelectedProvider, config.aiSelectedProvider);
  } else if (config.ai?.provider) {
    localStorage.setItem(CONFIG_KEYS.aiSelectedProvider, config.ai.provider);
  }
  if (config.aiSelectedModel) {
    localStorage.setItem(CONFIG_KEYS.aiSelectedModel, config.aiSelectedModel);
  } else if (config.ai?.model) {
    localStorage.setItem(CONFIG_KEYS.aiSelectedModel, config.ai.model);
  }

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
