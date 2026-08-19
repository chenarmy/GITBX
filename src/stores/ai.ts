import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { LlmConfig, GeneratedCommitMessage, SecretDetection } from '@/types/ai';

export const useAiStore = defineStore('ai', () => {
  const isAiModalOpen = ref<boolean>(false);
  const isGenerating = ref<boolean>(false);
  const generatedMessage = ref<GeneratedCommitMessage | null>(null);
  const detectedSecrets = ref<SecretDetection[]>([]);

  const llmConfig = ref<LlmConfig>({
    provider: 'openai',
    api_base: 'https://api.openai.com/v1',
    api_key: '',
    model: 'gpt-4o-mini',
    temperature: 0.3,
  });

  const openAiModal = () => {
    isAiModalOpen.value = true;
  };

  const closeAiModal = () => {
    isAiModalOpen.value = false;
  };

  return {
    isAiModalOpen,
    isGenerating,
    generatedMessage,
    detectedSecrets,
    llmConfig,
    openAiModal,
    closeAiModal,
  };
});
