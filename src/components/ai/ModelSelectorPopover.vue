<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAiStore } from '@/stores/ai';
import { useSettingsStore } from '@/stores/settings';
import { useI18n } from '@/i18n';
import {
  Search,
  RefreshCw,
  Check,
  Cpu,
  Settings,
  X,
  Terminal,
} from 'lucide-vue-next';
import ProviderIcon from './ProviderIcon.vue';
import type { AiProviderConfig, AiModelItem } from '@/types/ai';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const aiStore = useAiStore();
const settingsStore = useSettingsStore();
const { t } = useI18n();

const searchQuery = ref('');
const customModelInput = ref('');
const selectedProviderId = ref<string>(aiStore.activeProviderId);

const builtinProviders = computed(() => {
  return aiStore.providers.filter((p) => p.category === 'builtin');
});

const cliProviders = computed(() => {
  return aiStore.providers.filter((p) => p.category === 'cli');
});

const currentProvider = computed<AiProviderConfig>(() => {
  return (
    aiStore.providers.find((p) => p.id === selectedProviderId.value) ||
    aiStore.providers[0]
  );
});

const isFetching = computed(() => {
  return Boolean(aiStore.isFetchingModels[selectedProviderId.value]);
});

const fetchError = computed(() => {
  return aiStore.fetchModelsError[selectedProviderId.value];
});

// Filtered models for selected provider
const displayedModels = computed<AiModelItem[]>(() => {
  const pId = selectedProviderId.value;
  let models: AiModelItem[] = [];

  if (aiStore.cachedModels[pId] && aiStore.cachedModels[pId].length > 0) {
    models = aiStore.cachedModels[pId];
  } else {
    const preset = (aiStore as any).AI_PROVIDER_PRESETS?.[pId];
    if (preset && Array.isArray(preset.models)) {
      models = preset.models.map((m: string) => ({
        id: m,
        name: m,
        provider_id: pId,
      }));
    } else if (currentProvider.value.default_model) {
      models = [
        {
          id: currentProvider.value.default_model,
          name: currentProvider.value.default_model,
          provider_id: pId,
        },
      ];
    }
  }

  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return models;

  return models.filter(
    (m) =>
      m.id.toLowerCase().includes(query) ||
      m.name.toLowerCase().includes(query) ||
      (m.description && m.description.toLowerCase().includes(query)),
  );
});

function handleSelectProvider(providerId: string) {
  selectedProviderId.value = providerId;
}

function handleSelectModel(modelId: string) {
  aiStore.setProvider(selectedProviderId.value);
  aiStore.setModel(modelId);
  emit('close');
}

function handleApplyCustomModel() {
  const trimmed = customModelInput.value.trim();
  if (!trimmed) return;
  aiStore.setProvider(selectedProviderId.value);
  aiStore.setModel(trimmed);
  customModelInput.value = '';
  emit('close');
}

async function handleRefreshModels() {
  await aiStore.fetchModels(selectedProviderId.value, true);
}

function openSettings() {
  emit('close');
  settingsStore.openSettingsModal();
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none"
      @click.self="emit('close')"
      @keydown.esc.window="emit('close')"
    >
      <div
        class="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 select-text"
        @click.stop
      >
      <!-- Popover Header -->
      <div class="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
        <div class="flex items-center space-x-2">
          <div class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Cpu class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-foreground">{{ t('Select AI Model & Provider') }}</h3>
            <p class="text-[11px] text-muted-foreground">{{ t('Choose provider and model for chat, code review, and git operations') }}</p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Search Input Bar -->
      <div class="p-3 border-b border-border bg-background shrink-0">
        <div class="relative">
          <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('Search models, providers, or enter keywords...')"
            class="w-full pl-9 pr-4 py-1.5 text-xs bg-muted/30 border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground"
            autofocus
          />
        </div>
      </div>

      <!-- Main Body: 2-Column (Left: Providers, Right: Model Details & List) -->
      <div class="flex-1 flex overflow-hidden min-h-[420px]">
        <!-- Providers Column -->
        <div class="w-60 border-r border-border bg-muted/20 flex flex-col overflow-hidden shrink-0">
          <div class="flex-1 overflow-y-auto p-1.5 space-y-3">
            <!-- 1. Built-in LLM Providers -->
            <div>
              <div class="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {{ t('Built-in Support') }}
              </div>
              <div class="space-y-0.5 mt-0.5">
                <button
                  v-for="provider in builtinProviders"
                  :key="provider.id"
                  @click="handleSelectProvider(provider.id)"
                  :class="[
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition group',
                    selectedProviderId === provider.id
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-foreground/90 hover:bg-secondary hover:text-foreground',
                  ]"
                >
                  <div class="flex items-center space-x-2.5 truncate min-w-0">
                    <ProviderIcon :provider="provider.id" :size="15" />
                    <span class="truncate">{{ provider.name }}</span>
                  </div>
                  <Check
                    v-if="aiStore.activeProviderId === provider.id"
                    class="w-3.5 h-3.5 text-primary shrink-0 ml-1.5 stroke-[2.5]"
                  />
                </button>
              </div>
            </div>

            <!-- 2. CLI Agents -->
            <div>
              <div class="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span>{{ t('CLI Agents') }}</span>
                <Terminal class="w-3 h-3 opacity-60" />
              </div>
              <div class="space-y-0.5 mt-0.5">
                <button
                  v-for="provider in cliProviders"
                  :key="provider.id"
                  @click="handleSelectProvider(provider.id)"
                  :class="[
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition group',
                    selectedProviderId === provider.id
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-foreground/90 hover:bg-secondary hover:text-foreground',
                  ]"
                >
                  <div class="flex items-center space-x-2.5 truncate min-w-0">
                    <ProviderIcon :provider="provider.id" :size="15" />
                    <span class="truncate">{{ provider.name }}</span>
                  </div>
                  <Check
                    v-if="aiStore.activeProviderId === provider.id"
                    class="w-3.5 h-3.5 text-primary shrink-0 ml-1.5 stroke-[2.5]"
                  />
                </button>
              </div>
            </div>
          </div>

          <div class="p-2 border-t border-border shrink-0">
            <button
              @click="openSettings"
              class="w-full flex items-center justify-center space-x-1.5 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition"
            >
              <Settings class="w-3.5 h-3.5" />
              <span>{{ t('Configure API Keys') }}</span>
            </button>
          </div>
        </div>

        <!-- Model List & Details Pane (Right) -->
        <div class="flex-1 flex flex-col overflow-hidden bg-background">
          <!-- Header for Selected Provider -->
          <div class="px-4 py-2 border-b border-border bg-muted/20 flex items-center justify-between shrink-0">
            <div class="flex items-center space-x-2.5 min-w-0">
              <ProviderIcon :provider="currentProvider.id" :size="18" />
              <div class="truncate">
                <div class="flex items-center space-x-2">
                  <span class="text-xs font-bold text-foreground">{{ currentProvider.name }}</span>
                  <span class="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border">
                    {{ currentProvider.protocol }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Auto Load Button -->
            <button
              v-if="currentProvider.category !== 'cli'"
              @click="handleRefreshModels"
              :disabled="isFetching"
              class="flex items-center space-x-1 text-xs px-2.5 py-1 rounded-md bg-secondary hover:bg-secondary/80 text-foreground transition disabled:opacity-50 shrink-0"
              :title="t('Automatically discover models from API endpoint')"
            >
              <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': isFetching }" />
              <span class="text-[11px] font-medium">{{ isFetching ? t('Fetching...') : t('Auto Load') }}</span>
            </button>
          </div>

          <!-- CLI Agent Banner -->
          <div
            v-if="currentProvider.category === 'cli'"
            class="px-4 py-2 bg-muted/40 border-b border-border flex items-center justify-between text-xs shrink-0"
          >
            <div class="flex items-center space-x-2 text-foreground">
              <Terminal class="w-4 h-4 text-primary shrink-0" />
              <span class="text-[11px]">
                {{ t('CLI Command') }}: <code class="font-mono font-bold bg-muted px-1.5 py-0.5 rounded">{{ currentProvider.cli_command || currentProvider.id }}</code>
              </span>
            </div>
            <span class="text-[10px] text-muted-foreground">
              {{ t('Runs directly via local terminal CLI') }}
            </span>
          </div>

          <!-- Fetch Error Alert -->
          <div
            v-if="fetchError"
            class="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] flex items-center justify-between shrink-0"
          >
            <span class="truncate">{{ t('Model discovery notice: {msg}', { msg: fetchError }) }}</span>
            <button
              @click="aiStore.fetchModelsError[selectedProviderId] = null"
              class="text-xs hover:underline ml-2 shrink-0"
            >
              {{ t('Dismiss') }}
            </button>
          </div>

          <!-- Model Items Container -->
          <div class="flex-1 overflow-y-auto p-2 space-y-1">
            <div
              v-if="displayedModels.length === 0"
              class="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground"
            >
              <Cpu class="w-8 h-8 opacity-30 mb-2" />
              <p class="text-xs font-medium">{{ t('No models found') }}</p>
              <p class="text-[11px] mt-1">{{ t('Click "Auto Load" above or enter a model ID below') }}</p>
            </div>

            <div
              v-for="model in displayedModels"
              :key="model.id"
              @click="handleSelectModel(model.id)"
              :class="[
                'group p-2.5 rounded-lg border cursor-pointer transition flex items-center justify-between',
                aiStore.activeModelId === model.id && aiStore.activeProviderId === selectedProviderId
                  ? 'border-primary/40 bg-primary/5 text-foreground shadow-xs'
                  : 'border-transparent hover:border-border hover:bg-secondary/60 text-foreground/90',
              ]"
            >
              <div class="min-w-0 pr-3">
                <div class="flex items-center space-x-2">
                  <span class="text-xs font-semibold truncate">{{ model.name || model.id }}</span>
                  <span
                    v-if="aiStore.activeModelId === model.id && aiStore.activeProviderId === selectedProviderId"
                    class="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-bold"
                  >
                    {{ t('Active') }}
                  </span>
                </div>
                <div class="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                  {{ model.id }}
                </div>
                <p v-if="model.description" class="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                  {{ model.description }}
                </p>
              </div>

              <div class="shrink-0 flex items-center space-x-2">
                <span
                  v-if="model.context_length"
                  class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                >
                  {{ Math.round(model.context_length / 1024) }}k
                </span>
                <div
                  v-if="aiStore.activeModelId === model.id && aiStore.activeProviderId === selectedProviderId"
                  class="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                >
                  <Check class="w-3 h-3 stroke-[2.5]" />
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom: Custom Model ID Input Fallback -->
          <div class="p-3 border-t border-border bg-muted/20 shrink-0">
            <label class="text-[11px] font-medium text-muted-foreground block mb-1">
              {{ t('Manual Model ID (Enter any custom or fine-tuned model)') }}
            </label>
            <div class="flex space-x-2">
              <input
                v-model="customModelInput"
                type="text"
                placeholder="e.g. gpt-4.5-preview, deepseek-coder-v2, claude-3-7-sonnet..."
                class="flex-1 px-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                @keydown.enter="handleApplyCustomModel"
              />
              <button
                @click="handleApplyCustomModel"
                :disabled="!customModelInput.trim()"
                class="px-3.5 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
              >
                {{ t('Apply') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Popover Footer -->
      <div class="px-4 py-2.5 border-t border-border bg-muted/40 flex items-center justify-between text-xs shrink-0">
        <div class="text-[11px] text-muted-foreground flex items-center space-x-1.5">
          <span>{{ t('Current active:') }}</span>
          <ProviderIcon :provider="aiStore.activeProvider.id" :size="13" />
          <span class="font-bold text-foreground font-mono">{{ aiStore.activeProvider.name }} / {{ aiStore.activeModelId }}</span>
        </div>
        <button
          @click="emit('close')"
          class="px-3.5 py-1 rounded-md bg-secondary hover:bg-secondary/80 text-foreground transition font-medium"
        >
          {{ t('Close') }}
        </button>
      </div>
    </div>
  </div>
</Teleport>
</template>
