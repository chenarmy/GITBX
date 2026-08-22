<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import { AI_PROVIDER_PRESETS, useAiStore } from '@/stores/ai';
import type { LlmProvider } from '@/types/ai';
import { useGitApi } from '@/composables/useGitApi';
import { useNotificationStore } from '@/stores/notification';
import { Settings, X, User, Cpu, Info } from 'lucide-vue-next';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import { useI18n } from '@/i18n';
import { computed, ref } from 'vue';
import AboutUpdates from '@/components/settings/AboutUpdates.vue';

const settingsStore = useSettingsStore();
const aiStore = useAiStore();
const gitApi = useGitApi();
const notification = useNotificationStore();
const { t } = useI18n();
const isCustomProvider = computed(() => aiStore.llmConfig.provider === 'custom');
const activeTab = ref<'settings' | 'about'>('settings');

async function saveSettings() {
  if (aiStore.llmConfig.api_key) {
    try {
      await gitApi.saveCredential(aiStore.llmConfig.provider, aiStore.llmConfig.api_key);
      aiStore.llmConfig.api_key = '';
      notification.success(t('Settings Saved'), t('The AI credential was stored in the system keyring.'));
    } catch (error: any) {
      notification.warning(t('Settings Saved'), error?.message || t('The key remains in memory only.'));
    }
  }
  try {
    await aiStore.persistConfig();
    await settingsStore.persistSettings();
    notification.success(t('Settings Saved'), t('Configuration was saved to the user directory.'));
    settingsStore.isSettingsModalOpen = false;
  } catch (error: any) {
    notification.error(t('Failed to save settings'), error?.message || String(error));
  }
}

function handleProviderChange(event: Event) {
  const provider = (event.target as HTMLSelectElement).value as LlmProvider;
  aiStore.setProvider(provider);
}

function providerModels() {
  if (aiStore.llmConfig.provider === 'custom') return [];
  return AI_PROVIDER_PRESETS[aiStore.llmConfig.provider].models;
}

function closeSettings() {
  if (activeTab.value === 'settings') {
    void saveSettings();
  } else {
    settingsStore.isSettingsModalOpen = false;
  }
}
</script>

<template>
  <div
    v-if="settingsStore.isSettingsModalOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <div
      class="w-full max-w-3xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs"
    >
      <!-- Modal Header -->
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border select-none">
        <div class="flex items-center space-x-2">
          <Settings class="w-4 h-4 text-primary" />
          <span class="font-bold text-sm text-foreground">{{ t('GITBX Settings') }}</span>
        </div>
        <button
          @click="closeSettings"
          class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="flex border-b border-border bg-muted/20 px-4">
        <button
          class="inline-flex items-center gap-1.5 border-b-2 px-3 py-2 transition"
          :class="activeTab === 'settings' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'settings'"
        >
          <Settings class="h-3.5 w-3.5" />
          {{ t('Settings') }}
        </button>
        <button
          class="inline-flex items-center gap-1.5 border-b-2 px-3 py-2 transition"
          :class="activeTab === 'about' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'about'"
        >
          <Info class="h-3.5 w-3.5" />
          {{ t('About GITBX') }}
        </button>
      </div>

      <!-- Settings Body -->
      <div v-show="activeTab === 'settings'" class="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        <div class="space-y-2">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground">
            <span>{{ t('Language') }}</span>
          </div>
          <select
            :value="settingsStore.language"
            @change="settingsStore.changeLanguage(($event.target as HTMLSelectElement).value as any)"
            class="w-full bg-background border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option v-for="item in SUPPORTED_LOCALES" :key="item.code" :value="item.code">
              {{ item.nativeLabel }} · {{ item.label }}
            </option>
          </select>
        </div>

        <!-- Git Signature -->
        <div class="space-y-2">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground">
            <User class="w-3.5 h-3.5 text-blue-400" />
            <span>{{ t('Git User Signature') }}</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('Author Name') }}</label>
              <input
                v-model="settingsStore.authorName"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('Author Email') }}</label>
              <input
                v-model="settingsStore.authorEmail"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <!-- AI Provider Configuration -->
        <div class="space-y-2 border-t border-border pt-3">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground">
            <Cpu class="w-3.5 h-3.5 text-purple-400" />
            <span>{{ t('AI Copilot & LLM Provider') }}</span>
          </div>
          <div :key="aiStore.llmConfig.provider" class="space-y-2">
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('Provider') }}</label>
              <select
                :value="aiStore.llmConfig.provider"
                @change="handleProviderChange"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
                <option value="claude">Anthropic Claude (3.5 Sonnet)</option>
                <option value="deepseek">DeepSeek (V3 / R1)</option>
                <option value="ollama">Ollama (Local / Offline)</option>
                <option value="custom">Custom OpenAI-Compatible API</option>
              </select>
            </div>
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('Model') }}</label>
              <select
                v-if="!isCustomProvider"
                v-model="aiStore.llmConfig.model"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option v-for="model in providerModels()" :key="model" :value="model">{{ model }}</option>
              </select>
              <input
                v-else
                v-model="aiStore.llmConfig.model"
                placeholder="Model ID"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('API Base URL') }}</label>
              <input
                v-model="aiStore.llmConfig.api_base"
                :placeholder="isCustomProvider ? 'https://api.example.com/v1' : undefined"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p v-if="isCustomProvider" class="mt-1 text-[10px] text-muted-foreground">
                OpenAI-compatible APIs usually require the /v1 path prefix.
              </p>
            </div>
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('API Key') }}</label>
              <input
                v-model="aiStore.llmConfig.api_key"
                type="password"
                placeholder="sk-..."
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'about'" class="max-h-[70vh] overflow-y-auto p-4">
        <AboutUpdates />
      </div>

      <!-- Footer -->
      <div class="h-11 bg-muted/30 px-4 flex items-center justify-end border-t border-border">
        <button
          @click="activeTab === 'settings' ? saveSettings() : closeSettings()"
          class="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition"
        >
          {{ activeTab === 'settings' ? t('Save & Close') : t('Close') }}
        </button>
      </div>
    </div>
  </div>
</template>
