<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import { useAiStore } from '@/stores/ai';
import { useGitApi } from '@/composables/useGitApi';
import { useNotificationStore } from '@/stores/notification';
import { Settings, X, User, Cpu } from 'lucide-vue-next';

const settingsStore = useSettingsStore();
const aiStore = useAiStore();
const gitApi = useGitApi();
const notification = useNotificationStore();

async function saveSettings() {
  if (aiStore.llmConfig.api_key) {
    try {
      await gitApi.saveCredential(aiStore.llmConfig.provider, aiStore.llmConfig.api_key);
      aiStore.llmConfig.api_key = '';
      notification.success('Settings Saved', 'The AI credential was stored in the system keyring.');
    } catch (error: any) {
      notification.warning('Settings Saved', error?.message || 'The key remains in memory only.');
    }
  }
  settingsStore.isSettingsModalOpen = false;
}
</script>

<template>
  <div
    v-if="settingsStore.isSettingsModalOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <div
      class="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs"
    >
      <!-- Modal Header -->
      <div class="h-11 bg-muted/50 px-4 flex items-center justify-between border-b border-border select-none">
        <div class="flex items-center space-x-2">
          <Settings class="w-4 h-4 text-primary" />
          <span class="font-bold text-sm text-foreground">GITBX Settings</span>
        </div>
        <button
          @click="saveSettings"
          class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Settings Body -->
      <div class="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        <!-- Git Signature -->
        <div class="space-y-2">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground">
            <User class="w-3.5 h-3.5 text-blue-400" />
            <span>Git User Signature</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[11px] text-muted-foreground">Author Name</label>
              <input
                v-model="settingsStore.authorName"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="text-[11px] text-muted-foreground">Author Email</label>
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
            <span>AI Copilot & LLM Provider</span>
          </div>
          <div class="space-y-2">
            <div>
              <label class="text-[11px] text-muted-foreground">Provider</label>
              <select
                v-model="aiStore.llmConfig.provider"
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
              <label class="text-[11px] text-muted-foreground">API Base URL</label>
              <input
                v-model="aiStore.llmConfig.api_base"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 mt-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label class="text-[11px] text-muted-foreground">API Key</label>
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

      <!-- Footer -->
      <div class="h-11 bg-muted/30 px-4 flex items-center justify-end border-t border-border">
        <button
          @click="saveSettings"
          class="px-4 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition"
        >
          Save & Close
        </button>
      </div>
    </div>
  </div>
</template>
