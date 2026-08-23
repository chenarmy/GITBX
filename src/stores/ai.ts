import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { LlmConfig, GeneratedCommitMessage, SecretDetection, LlmProvider } from '@/types/ai';
import { CONFIG_KEYS, persistAppConfig } from '@/services/appConfig';

export const AI_PROVIDER_PRESETS: Record<Exclude<LlmProvider, 'custom'>, { api_base: string; model: string; models: string[] }> = {
  openai: {
    api_base: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  },
  claude: {
    api_base: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-latest',
    models: ['claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest', 'claude-3-haiku-20240307'],
  },
  deepseek: {
    api_base: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  ollama: {
    api_base: 'http://127.0.0.1:11434/v1',
    model: 'llama3.2',
    models: ['llama3.2', 'qwen2.5-coder:7b', 'deepseek-r1:7b'],
  },
};

const CUSTOM_PROVIDER_DEFAULTS = {
  api_base: '',
  model: '',
} as const;

const defaultConfig: LlmConfig = {
  provider: 'openai',
  api_base: AI_PROVIDER_PRESETS.openai.api_base,
  api_key: '',
  model: AI_PROVIDER_PRESETS.openai.model,
  temperature: 0.3,
};

function loadConfig(): LlmConfig {
  try {
    const saved = localStorage.getItem(CONFIG_KEYS.ai);
    if (!saved) return { ...defaultConfig };
    const parsed = JSON.parse(saved) as Partial<LlmConfig>;
    return { ...defaultConfig, ...parsed, api_key: '' };
  } catch {
    return { ...defaultConfig };
  }
}

export const useAiStore = defineStore('ai', () => {
  const isAiModalOpen = ref<boolean>(false);
  const isGenerating = ref<boolean>(false);
  const generatedMessage = ref<GeneratedCommitMessage | null>(null);
  const detectedSecrets = ref<SecretDetection[]>([]);
  const draftCommitMessage = ref<string>('');

  const llmConfig = ref<LlmConfig>(loadConfig());

  const persistConfig = async () => {
    const { api_key: _apiKey, ...safeConfig } = llmConfig.value;
    localStorage.setItem(CONFIG_KEYS.ai, JSON.stringify(safeConfig));
    await persistAppConfig();
  };

  const setProvider = (provider: LlmProvider) => {
    const previousProvider = llmConfig.value.provider;
    llmConfig.value.provider = provider;
    // Never reuse a credential entered for a different provider.
    llmConfig.value.api_key = '';
    if (provider === 'custom' && previousProvider !== 'custom') {
      llmConfig.value.api_base = CUSTOM_PROVIDER_DEFAULTS.api_base;
      llmConfig.value.model = CUSTOM_PROVIDER_DEFAULTS.model;
    } else if (provider !== 'custom') {
      const preset = AI_PROVIDER_PRESETS[provider];
      llmConfig.value.api_base = preset.api_base;
      llmConfig.value.model = preset.model;
    }
    void persistConfig().catch(() => undefined);
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
    isAiModalOpen,
    isGenerating,
    generatedMessage,
    detectedSecrets,
    llmConfig,
    setProvider,
    persistConfig,
    draftCommitMessage,
    openAiModal,
    closeAiModal,
    applyCommitMessage,
  };
});
