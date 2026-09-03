<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import { AI_PROVIDER_PRESETS, useAiStore } from '@/stores/ai';
import type { LlmProvider } from '@/types/ai';
import { useGitApi } from '@/composables/useGitApi';
import { useNotificationStore } from '@/stores/notification';
import { useUpdatesStore } from '@/stores/updates';
import { Settings, X, User, Cpu, Info, Globe2, KeyRound, FolderOpen } from 'lucide-vue-next';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/config';
import { useI18n } from '@/i18n';
import { computed, ref, watch } from 'vue';
import AboutUpdates from '@/components/settings/AboutUpdates.vue';
import type { LlmConfig } from '@/types/ai';

const settingsStore = useSettingsStore();
const aiStore = useAiStore();
const gitApi = useGitApi();
const notification = useNotificationStore();
const updatesStore = useUpdatesStore();
const { t } = useI18n();
const activeTab = ref<'settings' | 'about'>('settings');
const proxyPassword = ref('');
const draftLanguage = ref<Locale>(settingsStore.language);
const draftProxyMode = ref(settingsStore.proxyMode);
const draftProxyHost = ref(settingsStore.proxyHost);
const draftProxyPort = ref(settingsStore.proxyPort);
const draftProxyAuthEnabled = ref(settingsStore.proxyAuthEnabled);
const draftProxyUsername = ref(settingsStore.proxyUsername);
const draftSshKey = ref(settingsStore.sshKey);
const draftSshPassphrase = ref('');
const draftAuthorName = ref(settingsStore.authorName);
const draftAuthorEmail = ref(settingsStore.authorEmail);
const draftLlmConfig = ref<LlmConfig>({ ...aiStore.llmConfig, api_key: '' });
const isCustomProvider = computed(() => draftLlmConfig.value.provider === 'custom');

function resetDraft() {
  draftLanguage.value = settingsStore.language;
  draftProxyMode.value = settingsStore.proxyMode;
  draftProxyHost.value = settingsStore.proxyHost;
  draftProxyPort.value = settingsStore.proxyPort;
  draftProxyAuthEnabled.value = settingsStore.proxyAuthEnabled;
  draftProxyUsername.value = settingsStore.proxyUsername;
  draftSshKey.value = settingsStore.sshKey;
  draftSshPassphrase.value = '';
  draftAuthorName.value = settingsStore.authorName;
  draftAuthorEmail.value = settingsStore.authorEmail;
  draftLlmConfig.value = { ...aiStore.llmConfig, api_key: '' };
  proxyPassword.value = '';
}

watch(
  () => settingsStore.isSettingsModalOpen,
  (isOpen) => {
    if (isOpen) {
      resetDraft();
      activeTab.value = 'settings';
    }
  },
);

async function saveSettings() {
  if (draftProxyMode.value === 'custom') {
    const port = Number(draftProxyPort.value);
    if (!draftProxyHost.value.trim() || !Number.isInteger(port) || port < 1 || port > 65535) {
      notification.error(t('Invalid proxy settings'), t('Enter a proxy server and a port between 1 and 65535.'));
      return;
    }
  }
  let savedAiCredential = false;
  if (draftLlmConfig.value.api_key) {
    try {
      await gitApi.saveCredential(draftLlmConfig.value.provider, draftLlmConfig.value.api_key);
      savedAiCredential = true;
      notification.success(t('Settings Saved'), t('The AI credential was stored in the system keyring.'));
    } catch (error: any) {
      notification.warning(t('Settings Saved'), error?.message || t('The key remains in memory only.'));
    }
  }
  if (draftProxyAuthEnabled.value && proxyPassword.value && gitApi.isTauri()) {
    try {
      await gitApi.saveCredential('proxy', proxyPassword.value);
      proxyPassword.value = '';
    } catch (error: any) {
      notification.warning(t('Settings Saved'), error?.message || t('The proxy password remains in memory only.'));
    }
  }
  try {
    let normalizedSshKey = draftSshKey.value.trim();
    if (normalizedSshKey && draftSshPassphrase.value) {
      normalizedSshKey = await gitApi.saveSshPassphrase(normalizedSshKey, draftSshPassphrase.value);
      draftSshPassphrase.value = '';
    }
    settingsStore.proxyMode = draftProxyMode.value;
    settingsStore.proxyHost = draftProxyHost.value;
    settingsStore.proxyPort = Number(draftProxyPort.value);
    settingsStore.proxyAuthEnabled = draftProxyAuthEnabled.value;
    settingsStore.proxyUsername = draftProxyUsername.value;
    settingsStore.sshKey = normalizedSshKey;
    settingsStore.authorName = draftAuthorName.value;
    settingsStore.authorEmail = draftAuthorEmail.value;
    settingsStore.changeLanguage(draftLanguage.value);
    Object.assign(aiStore.llmConfig, draftLlmConfig.value, {
      api_key: savedAiCredential ? '' : draftLlmConfig.value.api_key,
    });
    await aiStore.persistConfig();
    await settingsStore.persistSettings();
    notification.success(t('Settings Saved'), t('Configuration was saved to the user directory.'));
    settingsStore.isSettingsModalOpen = false;
  } catch (error: any) {
    notification.error(t('Failed to save settings'), error?.message || String(error));
  }
}

async function selectGlobalSshKey() {
  const selected = await openDialog({
    multiple: false,
    directory: false,
    title: t('Select SSH Private Key'),
  });
  if (typeof selected === 'string') draftSshKey.value = selected;
}

function handleProviderChange(event: Event) {
  const provider = (event.target as HTMLSelectElement).value as LlmProvider;
  const previousProvider = draftLlmConfig.value.provider;
  draftLlmConfig.value.provider = provider;
  draftLlmConfig.value.api_key = '';
  if (provider === 'custom' && previousProvider !== 'custom') {
    draftLlmConfig.value.api_base = '';
    draftLlmConfig.value.model = '';
  } else if (provider !== 'custom') {
    const preset = AI_PROVIDER_PRESETS[provider];
    draftLlmConfig.value.api_base = preset.api_base;
    draftLlmConfig.value.model = preset.model;
  }
}

function providerModels() {
  if (draftLlmConfig.value.provider === 'custom') return [];
  return AI_PROVIDER_PRESETS[draftLlmConfig.value.provider].models;
}

function closeSettings() {
  resetDraft();
  settingsStore.isSettingsModalOpen = false;
}
</script>

<template>
  <div
    v-if="settingsStore.isSettingsModalOpen"
    @click.self="closeSettings"
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
          class="relative inline-flex items-center gap-1.5 border-b-2 px-3 py-2 transition"
          :class="activeTab === 'about' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'about'"
        >
          <Info class="h-3.5 w-3.5" />
          {{ t('About GITBX') }}
          <span
            v-if="updatesStore.hasUpdateAvailable"
            class="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card"
            :title="t('New version available')"
            aria-label="New version available"
          />
        </button>
      </div>

      <!-- Settings Body -->
      <div v-show="activeTab === 'settings'" class="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        <div class="space-y-2">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground">
            <span>{{ t('Language') }}</span>
          </div>
          <select
            v-model="draftLanguage"
            class="w-full bg-background border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option v-for="item in SUPPORTED_LOCALES" :key="item.code" :value="item.code">
              {{ item.nativeLabel }} · {{ item.label }}
            </option>
          </select>
        </div>

        <!-- Network Proxy -->
        <div class="space-y-2 border-t border-border pt-3">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground">
            <Globe2 class="w-3.5 h-3.5 text-sky-400" />
            <span>{{ t('Proxy Server') }}</span>
          </div>
          <div class="space-y-1.5 text-muted-foreground">
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="draftProxyMode" type="radio" value="system" />
              <span>{{ t('Use system proxy settings') }}</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="draftProxyMode" type="radio" value="custom" />
              <span>{{ t('Use custom proxy') }}</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="draftProxyMode" type="radio" value="none" />
              <span>{{ t('Do not use a proxy') }}</span>
            </label>
          </div>
          <div v-if="draftProxyMode === 'custom'" class="space-y-2 rounded border border-border bg-background/50 p-2">
            <div class="grid grid-cols-[1fr_7rem] gap-2">
              <div>
                <label class="text-[11px] text-muted-foreground">{{ t('Proxy server') }}</label>
                <input
                  v-model="draftProxyHost"
                  placeholder="127.0.0.1"
                  class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label class="text-[11px] text-muted-foreground">{{ t('Port') }}</label>
                <input
                  v-model.number="draftProxyPort"
                  type="number"
                  min="1"
                  max="65535"
                  placeholder="8080"
                  class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <label class="flex items-center gap-2 text-muted-foreground cursor-pointer">
              <input v-model="draftProxyAuthEnabled" type="checkbox" />
              <span>{{ t('Proxy requires authentication') }}</span>
            </label>
            <div v-if="draftProxyAuthEnabled" class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[11px] text-muted-foreground">{{ t('Username') }}</label>
                <input
                  v-model="draftProxyUsername"
                  class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label class="text-[11px] text-muted-foreground">{{ t('Password') }}</label>
                <input
                  v-model="proxyPassword"
                  type="password"
                  :placeholder="t('Leave blank to keep saved password')"
                  class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <p class="text-[10px] text-muted-foreground">
              {{ t('Proxy settings apply to HTTP(S) Git operations. SSH remotes are not proxied.') }}
            </p>
          </div>
        </div>

        <!-- Global SSH identity -->
        <div class="space-y-2 border-t border-border pt-3">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground">
            <KeyRound class="w-3.5 h-3.5 text-emerald-400" />
            <span>{{ t('Global SSH Key') }}</span>
          </div>
          <div class="flex items-center gap-2">
            <input
              v-model="draftSshKey"
              :placeholder="t('Use SSH agent or Git credentials when empty')"
              class="min-w-0 flex-1 bg-background border border-border rounded px-2.5 py-1.5 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button type="button" class="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1.5 hover:bg-accent" @click="selectGlobalSshKey">
              <FolderOpen class="h-3.5 w-3.5" />{{ t('Browse') }}
            </button>
            <button v-if="draftSshKey" type="button" class="rounded px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" @click="draftSshKey = ''">
              {{ t('Clear') }}
            </button>
          </div>
          <div v-if="draftSshKey">
            <label class="text-[11px] text-muted-foreground">{{ t('SSH Key Passphrase') }}</label>
            <input
              v-model="draftSshPassphrase"
              type="password"
              :placeholder="t('Leave blank to keep the saved passphrase')"
              autocomplete="new-password"
              class="mt-1 w-full rounded border border-border bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <p class="text-[10px] text-muted-foreground">
            {{ t('Used for SSH remotes unless the current repository has its own key.') }}
          </p>
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
                v-model="draftAuthorName"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('Author Email') }}</label>
              <input
                v-model="draftAuthorEmail"
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
          <div :key="draftLlmConfig.provider" class="space-y-2">
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('Provider') }}</label>
              <select
                :value="draftLlmConfig.provider"
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
                v-model="draftLlmConfig.model"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option v-for="model in providerModels()" :key="model" :value="model">{{ model }}</option>
              </select>
              <input
                v-else
                v-model="draftLlmConfig.model"
                placeholder="Model ID"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="text-[11px] text-muted-foreground">{{ t('API Base URL') }}</label>
              <input
                v-model="draftLlmConfig.api_base"
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
                v-model="draftLlmConfig.api_key"
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
