import { defineStore } from 'pinia';
import { ref, computed, reactive, watch } from 'vue';
import type {
  LlmConfig,
  GeneratedCommitMessage,
  SecretDetection,
  LlmProvider,
  AiMode,
  AiProviderConfig,
  AiModelItem,
  AiSession,
  AiMessage,
} from '@/types/ai';
import { CONFIG_KEYS, persistAppConfig } from '@/services/appConfig';
import { fetchAiModels } from '@/api/domain/aiApi';

export const AI_PROVIDER_PRESETS: Record<
  Exclude<LlmProvider, 'custom'>,
  { api_base: string; model: string; models: string[]; category?: 'builtin' | 'cli'; badge?: string; cli_command?: string }
> = {
  // 1. Built-in API Providers
  claude: {
    api_base: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-latest',
    models: ['claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest', 'claude-3-haiku-20240307'],
    category: 'builtin',
  },
  openai: {
    api_base: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'o1-mini', 'o3-mini'],
    category: 'builtin',
  },
  gemini: {
    api_base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.0-pro-exp-02-05', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    category: 'builtin',
  },
  deepseek: {
    api_base: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    category: 'builtin',
  },
  kimi: {
    api_base: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    category: 'builtin',
  },
  qwen: {
    api_base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen2.5-coder-32b-instruct'],
    category: 'builtin',
  },
  zhipu: {
    api_base: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4-long', 'codegeex-4'],
    category: 'builtin',
  },
  minimax: {
    api_base: 'https://api.minimax.chat/v1',
    model: 'MiniMax-Text-01',
    models: ['MiniMax-Text-01', 'abab6.5s-chat'],
    category: 'builtin',
  },
  ollama: {
    api_base: 'http://127.0.0.1:11434/v1',
    model: 'llama3.2',
    models: ['llama3.2', 'qwen2.5-coder:7b', 'deepseek-r1:7b'],
    category: 'builtin',
  },
  'anthropic-compatible': {
    api_base: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-latest',
    models: ['claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest'],
    category: 'builtin',
  },
  'openai-compatible': {
    api_base: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'deepseek-chat', 'qwen-plus'],
    category: 'builtin',
  },

  // 2. CLI Agents
  'claude-code-cli': {
    api_base: '',
    model: 'claude-3-7-sonnet',
    models: ['claude-3-7-sonnet', 'claude-3-5-sonnet'],
    category: 'cli',
    cli_command: 'claude',
  },
  'codex-cli': {
    api_base: '',
    model: 'gpt-4o',
    models: ['gpt-4o', 'o1-mini'],
    category: 'cli',
    cli_command: 'codex',
  },
  'opencode-cli': {
    api_base: '',
    model: 'opencode-default',
    models: ['opencode-default', 'deepseek-coder'],
    category: 'cli',
    cli_command: 'opencode',
  },
  'cursor-cli': {
    api_base: '',
    model: 'cursor-agent',
    models: ['cursor-agent', 'claude-3.5-sonnet', 'gpt-4o'],
    category: 'cli',
    cli_command: 'cursor',
  },
  'codebuddy-code': {
    api_base: '',
    model: 'codebuddy-v1',
    models: ['codebuddy-v1', 'hunyuan-code'],
    category: 'cli',
    cli_command: 'codebuddy',
  },
  'qoder-cli': {
    api_base: '',
    model: 'qoder-default',
    models: ['qoder-default', 'qwen2.5-coder'],
    category: 'cli',
    cli_command: 'qoder',
  },
  'grok-cli': {
    api_base: '',
    model: 'grok-2',
    models: ['grok-2', 'grok-beta'],
    category: 'cli',
    cli_command: 'grok',
  },
  'pi-coding-agent': {
    api_base: '',
    model: 'pi-agent-v1',
    models: ['pi-agent-v1', 'pi-fast'],
    category: 'cli',
    cli_command: 'pi',
  },

  openrouter: {
    api_base: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.5-sonnet',
    models: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'deepseek/deepseek-chat'],
    category: 'builtin',
  },
};

export const DEFAULT_AI_PROVIDERS: AiProviderConfig[] = [
  // Built-in
  {
    id: 'claude',
    name: 'Claude',
    protocol: 'claude',
    api_base: AI_PROVIDER_PRESETS.claude.api_base,
    api_key: '',
    default_model: AI_PROVIDER_PRESETS.claude.model,
    category: 'builtin',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai',
    api_base: AI_PROVIDER_PRESETS.openai.api_base,
    api_key: '',
    default_model: AI_PROVIDER_PRESETS.openai.model,
    category: 'builtin',
    is_default: true,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    protocol: 'gemini',
    api_base: AI_PROVIDER_PRESETS.gemini.api_base,
    api_key: '',
    default_model: AI_PROVIDER_PRESETS.gemini.model,
    category: 'builtin',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'deepseek',
    api_base: AI_PROVIDER_PRESETS.deepseek.api_base,
    api_key: '',
    default_model: AI_PROVIDER_PRESETS.deepseek.model,
    category: 'builtin',
  },
  {
    id: 'kimi',
    name: 'Kimi',
    protocol: 'kimi',
    api_base: AI_PROVIDER_PRESETS.kimi.api_base,
    api_key: '',
    default_model: AI_PROVIDER_PRESETS.kimi.model,
    category: 'builtin',
  },
  {
    id: 'qwen',
    name: 'Qwen',
    protocol: 'qwen',
    api_base: AI_PROVIDER_PRESETS.qwen.api_base,
    api_key: '',
    default_model: AI_PROVIDER_PRESETS.qwen.model,
    category: 'builtin',
  },
  {
    id: 'zhipu',
    name: 'Zhipu',
    protocol: 'zhipu',
    api_base: AI_PROVIDER_PRESETS.zhipu.api_base,
    api_key: '',
    default_model: AI_PROVIDER_PRESETS.zhipu.model,
    category: 'builtin',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    protocol: 'minimax',
    api_base: AI_PROVIDER_PRESETS.minimax.api_base,
    api_key: '',
    default_model: AI_PROVIDER_PRESETS.minimax.model,
    category: 'builtin',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    protocol: 'ollama',
    api_base: AI_PROVIDER_PRESETS.ollama.api_base,
    api_key: '',
    default_model: AI_PROVIDER_PRESETS.ollama.model,
    category: 'builtin',
  },
  {
    id: 'anthropic-compatible',
    name: 'Anthropic Compatible',
    protocol: 'anthropic-compatible',
    api_base: AI_PROVIDER_PRESETS['anthropic-compatible'].api_base,
    api_key: '',
    default_model: AI_PROVIDER_PRESETS['anthropic-compatible'].model,
    category: 'builtin',
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI Compatible',
    protocol: 'openai-compatible',
    api_base: AI_PROVIDER_PRESETS['openai-compatible'].api_base,
    api_key: '',
    default_model: AI_PROVIDER_PRESETS['openai-compatible'].model,
    category: 'builtin',
  },

  // CLI Agents
  {
    id: 'claude-code-cli',
    name: 'Claude Code CLI',
    protocol: 'cli-agent',
    api_base: '',
    api_key: '',
    default_model: AI_PROVIDER_PRESETS['claude-code-cli'].model,
    category: 'cli',
    cli_command: 'claude',
  },
  {
    id: 'codex-cli',
    name: 'Codex CLI',
    protocol: 'cli-agent',
    api_base: '',
    api_key: '',
    default_model: AI_PROVIDER_PRESETS['codex-cli'].model,
    category: 'cli',
    cli_command: 'codex',
  },
  {
    id: 'opencode-cli',
    name: 'OpenCode CLI',
    protocol: 'cli-agent',
    api_base: '',
    api_key: '',
    default_model: AI_PROVIDER_PRESETS['opencode-cli'].model,
    category: 'cli',
    cli_command: 'opencode',
  },
  {
    id: 'cursor-cli',
    name: 'Cursor CLI',
    protocol: 'cli-agent',
    api_base: '',
    api_key: '',
    default_model: AI_PROVIDER_PRESETS['cursor-cli'].model,
    category: 'cli',
    cli_command: 'cursor',
  },
  {
    id: 'codebuddy-code',
    name: 'CodeBuddy Code',
    protocol: 'cli-agent',
    api_base: '',
    api_key: '',
    default_model: AI_PROVIDER_PRESETS['codebuddy-code'].model,
    category: 'cli',
    cli_command: 'codebuddy',
  },
  {
    id: 'qoder-cli',
    name: 'Qoder CLI',
    protocol: 'cli-agent',
    api_base: '',
    api_key: '',
    default_model: AI_PROVIDER_PRESETS['qoder-cli'].model,
    category: 'cli',
    cli_command: 'qoder',
  },
  {
    id: 'grok-cli',
    name: 'Grok CLI',
    protocol: 'cli-agent',
    api_base: '',
    api_key: '',
    default_model: AI_PROVIDER_PRESETS['grok-cli'].model,
    category: 'cli',
    cli_command: 'grok',
  },
  {
    id: 'pi-coding-agent',
    name: 'Pi Coding Agent',
    protocol: 'cli-agent',
    api_base: '',
    api_key: '',
    default_model: AI_PROVIDER_PRESETS['pi-coding-agent'].model,
    category: 'cli',
    cli_command: 'pi',
  },
  {
    id: 'custom',
    name: 'Custom',
    protocol: 'custom',
    api_base: 'https://api.openai.com/v1',
    api_key: '',
    default_model: 'custom-model',
    category: 'builtin',
  },
];

function loadProviders(): AiProviderConfig[] {
  try {
    const raw = localStorage.getItem(CONFIG_KEYS.aiProviders);
    if (!raw) return DEFAULT_AI_PROVIDERS.map((p) => ({ ...p }));
    const parsed = JSON.parse(raw) as AiProviderConfig[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      const existingMap = new Map(parsed.map((p) => [p.id, p]));
      // Maintain exact default order and merge updated fields like badge, category, cli_command
      const merged: AiProviderConfig[] = [];
      for (const preset of DEFAULT_AI_PROVIDERS) {
        const saved = existingMap.get(preset.id);
        if (saved) {
          merged.push({
            ...preset,
            ...saved,
            category: preset.category,
            badge: preset.badge,
            cli_command: preset.cli_command,
          });
          existingMap.delete(preset.id);
        } else {
          merged.push({ ...preset });
        }
      }
      // Any custom user-added providers (ignore any legacy sponsor entries)
      for (const extra of existingMap.values()) {
        if (
          !['aicodemirror', 'jalapeno-cloud', 'hualongai'].includes(extra.id) &&
          (extra as any).category !== 'sponsor'
        ) {
          merged.push(extra);
        }
      }
      return merged;
    }
    return DEFAULT_AI_PROVIDERS.map((p) => ({ ...p }));
  } catch {
    return DEFAULT_AI_PROVIDERS.map((p) => ({ ...p }));
  }
}

function loadSessions(): AiSession[] {
  try {
    const raw = localStorage.getItem(CONFIG_KEYS.aiSessions);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AiSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const useAiStore = defineStore('ai', () => {
  // Legacy / modal states
  const isAiModalOpen = ref<boolean>(false);
  const isGenerating = ref<boolean>(false);
  const generatedMessage = ref<GeneratedCommitMessage | null>(null);
  const detectedSecrets = ref<SecretDetection[]>([]);
  const draftCommitMessage = ref<string>('');

  // Sidebar visibility
  const isSidebarOpen = ref<boolean>(
    localStorage.getItem(CONFIG_KEYS.aiSidebarVisible) === 'true',
  );

  // Providers & Models
  const providers = ref<AiProviderConfig[]>(loadProviders());

  const getInitialProvider = (): string => {
    const saved = localStorage.getItem(CONFIG_KEYS.aiSelectedProvider);
    if (saved) return saved;
    const legacyRaw = localStorage.getItem(CONFIG_KEYS.ai);
    if (legacyRaw) {
      try {
        const parsed = JSON.parse(legacyRaw);
        if (parsed?.provider) return parsed.provider;
      } catch {}
    }
    return 'openai';
  };

  const getInitialModel = (providerId: string): string => {
    const saved = localStorage.getItem(CONFIG_KEYS.aiSelectedModel);
    if (saved) return saved;
    const legacyRaw = localStorage.getItem(CONFIG_KEYS.ai);
    if (legacyRaw) {
      try {
        const parsed = JSON.parse(legacyRaw);
        if (parsed?.model) return parsed.model;
      } catch {}
    }
    const matched = providers.value.find((p) => p.id === providerId);
    return matched?.default_model || 'gpt-4o-mini';
  };

  const initialProvider = getInitialProvider();
  const activeProviderId = ref<string>(initialProvider);
  const activeModelId = ref<string>(getInitialModel(initialProvider));
  const activeMode = ref<AiMode>('agent');

  // Dynamic model cache & fetching status
  const cachedModels = ref<Record<string, AiModelItem[]>>({});
  const isFetchingModels = ref<Record<string, boolean>>({});
  const fetchModelsError = ref<Record<string, string | null>>({});

  // Context: Repos & Branch selection
  const isPinnedToActive = ref<boolean>(true);
  const pinnedRepoPath = ref<string>('');
  const pinnedBranch = ref<string>('');

  // Sessions
  const sessions = ref<AiSession[]>(loadSessions());
  const activeSessionId = ref<string>(
    localStorage.getItem(CONFIG_KEYS.aiActiveSession) || '',
  );

  // Ensure active session exists
  if (!activeSessionId.value && sessions.value.length > 0) {
    activeSessionId.value = sessions.value[0].id;
  }

  // Active provider computed
  const activeProvider = computed<AiProviderConfig>(() => {
    return (
      providers.value.find((p) => p.id === activeProviderId.value) ||
      providers.value[0] ||
      DEFAULT_AI_PROVIDERS[0]
    );
  });

  // Active session computed
  const activeSession = computed<AiSession | undefined>(() => {
    return sessions.value.find((s) => s.id === activeSessionId.value);
  });

  // Available models for active provider
  const currentProviderModels = computed<AiModelItem[]>(() => {
    const pId = activeProviderId.value;
    if (cachedModels.value[pId] && cachedModels.value[pId].length > 0) {
      return cachedModels.value[pId];
    }
    const preset = (AI_PROVIDER_PRESETS as any)[pId];
    if (preset && Array.isArray(preset.models)) {
      return preset.models.map((m: string) => ({
        id: m,
        name: m,
        provider_id: pId,
      }));
    }
    if (activeProvider.value.default_model) {
      return [
        {
          id: activeProvider.value.default_model,
          name: activeProvider.value.default_model,
          provider_id: pId,
        },
      ];
    }
    return [];
  });

  // Reactive llmConfig for backward compatibility
  const llmConfig = reactive<LlmConfig>({
    provider: (activeProvider.value.protocol as LlmProvider) || 'openai',
    api_base: activeProvider.value.api_base,
    api_key: activeProvider.value.api_key || '',
    model: activeModelId.value || activeProvider.value.default_model,
    temperature: 0.3,
  });

  // Sync llmConfig changes back and forth
  watch(
    () => [activeProviderId.value, activeModelId.value, activeProvider.value.api_base, activeProvider.value.api_key],
    () => {
      llmConfig.provider = (activeProvider.value.protocol as LlmProvider) || 'openai';
      llmConfig.api_base = activeProvider.value.api_base;
      llmConfig.api_key = activeProvider.value.api_key || '';
      llmConfig.model = activeModelId.value || activeProvider.value.default_model;
    },
    { immediate: true },
  );

  // Persistence helpers
  const persistProviders = async () => {
    const safeProviders = providers.value.map((p) => ({
      ...p,
      api_key: '',
    }));
    localStorage.setItem(CONFIG_KEYS.aiProviders, JSON.stringify(safeProviders));
    await persistAppConfig();
  };

  const persistSessions = () => {
    localStorage.setItem(CONFIG_KEYS.aiSessions, JSON.stringify(sessions.value));
  };

  const persistConfig = async () => {
    const { api_key: _apiKey, ...safeConfig } = llmConfig;
    localStorage.setItem(CONFIG_KEYS.ai, JSON.stringify(safeConfig));
    localStorage.setItem(CONFIG_KEYS.aiSelectedProvider, activeProviderId.value);
    localStorage.setItem(CONFIG_KEYS.aiSelectedModel, activeModelId.value);
    await persistProviders();
  };

  // Actions
  const setProvider = (provider: LlmProvider | string) => {
    activeProviderId.value = provider;
    localStorage.setItem(CONFIG_KEYS.aiSelectedProvider, provider);
    const p = providers.value.find((item) => item.id === provider);
    if (p) {
      activeModelId.value = p.default_model;
      localStorage.setItem(CONFIG_KEYS.aiSelectedModel, p.default_model);
      llmConfig.provider = (p.protocol as LlmProvider) || 'openai';
      llmConfig.api_base = p.api_base;
      llmConfig.api_key = p.api_key || '';
      llmConfig.model = p.default_model;
    }
    void persistConfig().catch(() => undefined);
  };

  const setModel = (modelId: string) => {
    activeModelId.value = modelId;
    llmConfig.model = modelId;
    localStorage.setItem(CONFIG_KEYS.aiSelectedModel, modelId);
    void persistConfig().catch(() => undefined);
  };

  const setMode = (mode: AiMode) => {
    activeMode.value = mode;
  };

  const toggleSidebar = () => {
    isSidebarOpen.value = !isSidebarOpen.value;
    localStorage.setItem(CONFIG_KEYS.aiSidebarVisible, String(isSidebarOpen.value));
  };

  const openSidebar = () => {
    isSidebarOpen.value = true;
    localStorage.setItem(CONFIG_KEYS.aiSidebarVisible, 'true');
  };

  const closeSidebar = () => {
    isSidebarOpen.value = false;
    localStorage.setItem(CONFIG_KEYS.aiSidebarVisible, 'false');
  };

  // Fetch models dynamically from provider endpoint
  const fetchModels = async (providerId: string, force = false): Promise<AiModelItem[]> => {
    if (!force && cachedModels.value[providerId] && cachedModels.value[providerId].length > 0) {
      return cachedModels.value[providerId];
    }
    const provider = providers.value.find((p) => p.id === providerId);
    if (!provider) return [];

    isFetchingModels.value[providerId] = true;
    fetchModelsError.value[providerId] = null;

    try {
      const config: LlmConfig = {
        provider: (provider.protocol as LlmProvider) || 'openai',
        api_base: provider.api_base,
        api_key: provider.api_key,
        model: provider.default_model,
      };
      const fetched = await fetchAiModels(config);
      const items: AiModelItem[] = fetched.map((f) => ({
        id: f.id,
        name: f.name || f.id,
        provider_id: providerId,
      }));
      if (items.length > 0) {
        cachedModels.value[providerId] = items;
        if (providerId === activeProviderId.value && !items.some((m) => m.id === activeModelId.value)) {
          setModel(items[0].id);
        }
      }
      return items;
    } catch (err: any) {
      fetchModelsError.value[providerId] = err?.message || String(err);
      const preset = (AI_PROVIDER_PRESETS as any)[providerId];
      if (preset && Array.isArray(preset.models)) {
        const fallbackItems = preset.models.map((m: string) => ({
          id: m,
          name: m,
          provider_id: providerId,
        }));
        cachedModels.value[providerId] = fallbackItems;
        return fallbackItems;
      }
      return [];
    } finally {
      isFetchingModels.value[providerId] = false;
    }
  };

  // Provider CRUD
  const saveProvider = async (providerConfig: AiProviderConfig) => {
    const index = providers.value.findIndex((p) => p.id === providerConfig.id);
    if (index >= 0) {
      providers.value[index] = { ...providerConfig };
    } else {
      providers.value.push({ ...providerConfig });
    }
    await persistProviders();
  };

  const removeProvider = async (providerId: string) => {
    providers.value = providers.value.filter((p) => p.id !== providerId);
    if (activeProviderId.value === providerId) {
      setProvider(providers.value[0]?.id || 'openai');
    }
    await persistProviders();
  };

  // Sessions management
  const createSession = (
    title = '新对话',
    repoPath = '',
    branch = '',
  ): AiSession => {
    const newSession: AiSession = {
      id: 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title,
      repo_path: repoPath,
      branch,
      created_at: Date.now(),
      updated_at: Date.now(),
      messages: [],
    };
    sessions.value.unshift(newSession);
    activeSessionId.value = newSession.id;
    localStorage.setItem(CONFIG_KEYS.aiActiveSession, newSession.id);
    persistSessions();
    return newSession;
  };

  const switchSession = (id: string) => {
    activeSessionId.value = id;
    localStorage.setItem(CONFIG_KEYS.aiActiveSession, id);
  };

  const deleteSession = (id: string) => {
    sessions.value = sessions.value.filter((s) => s.id !== id);
    if (activeSessionId.value === id) {
      activeSessionId.value = sessions.value[0]?.id || '';
      localStorage.setItem(CONFIG_KEYS.aiActiveSession, activeSessionId.value);
    }
    persistSessions();
  };

  const clearSessionMessages = (id: string) => {
    const session = sessions.value.find((s) => s.id === id);
    if (session) {
      session.messages = [];
      session.updated_at = Date.now();
      persistSessions();
    }
  };

  const addMessageToActiveSession = (
    msg: Omit<AiMessage, 'id' | 'created_at'>,
  ): AiMessage => {
    if (!activeSession.value) {
      createSession();
    }
    const session = activeSession.value!;
    const message: AiMessage = {
      ...msg,
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      created_at: Date.now(),
    };
    session.messages.push(message);
    session.updated_at = Date.now();
    if (session.messages.filter((m) => m.role === 'user').length === 1 && msg.role === 'user') {
      session.title = msg.content.slice(0, 24).trim() || '新对话';
    }
    persistSessions();
    return message;
  };

  const updateMessageInActiveSession = (
    messageId: string,
    updates: Partial<AiMessage>,
  ) => {
    if (!activeSession.value) return;
    const msg = activeSession.value.messages.find((m) => m.id === messageId);
    if (msg) {
      Object.assign(msg, updates);
      activeSession.value.updated_at = Date.now();
      persistSessions();
    }
  };

  const openAiModal = () => {
    isAiModalOpen.value = true;
  };

  const closeAiModal = () => {
    isAiModalOpen.value = false;
  };

  const applyCommitMessage = (msg: string) => {
    draftCommitMessage.value = msg;
  };

  return {
    // Modal states
    isAiModalOpen,
    isGenerating,
    generatedMessage,
    detectedSecrets,
    draftCommitMessage,
    openAiModal,
    closeAiModal,
    applyCommitMessage,

    // Providers & models
    providers,
    activeProviderId,
    activeModelId,
    activeMode,
    activeProvider,
    currentProviderModels,
    cachedModels,
    isFetchingModels,
    fetchModelsError,
    setProvider,
    setModel,
    setMode,
    fetchModels,
    saveProvider,
    removeProvider,

    // Sidebar & Context
    isSidebarOpen,
    toggleSidebar,
    openSidebar,
    closeSidebar,
    isPinnedToActive,
    pinnedRepoPath,
    pinnedBranch,

    // Sessions
    sessions,
    activeSessionId,
    activeSession,
    createSession,
    switchSession,
    deleteSession,
    clearSessionMessages,
    addMessageToActiveSession,
    updateMessageInActiveSession,

    // Compatibility
    llmConfig,
    persistConfig,
  };
});
