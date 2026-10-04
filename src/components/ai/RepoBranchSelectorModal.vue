<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAiStore } from '@/stores/ai';
import { useRepoStore } from '@/stores/repo';
import { useI18n } from '@/i18n';
import {
  Check,
  X,
  Pin,
  Compass,
} from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const aiStore = useAiStore();
const repoStore = useRepoStore();
const { t } = useI18n();

const followWorkspace = ref<boolean>(aiStore.isPinnedToActive);
const selectedRepo = ref<string>(
  aiStore.pinnedRepoPath || repoStore.activeRepoPath || '',
);
const selectedBranch = ref<string>(
  aiStore.pinnedBranch || repoStore.repoInfo?.head_branch || '',
);

const activeRepoName = computed(() => {
  return repoStore.repoInfo?.name || repoStore.repoList.find((r) => r.path === repoStore.activeRepoPath)?.name || '';
});

const currentRepoBranches = computed(() => {
  return repoStore.branches;
});

function handleSave() {
  aiStore.isPinnedToActive = followWorkspace.value;
  if (!followWorkspace.value) {
    aiStore.pinnedRepoPath = selectedRepo.value;
    aiStore.pinnedBranch = selectedBranch.value;
  }
  emit('close');
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
        class="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 select-text"
        @click.stop
      >
      <!-- Modal Header -->
      <div class="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/30">
        <div class="flex items-center space-x-2">
          <div class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Compass class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-foreground">{{ t('Context Repository & Branch') }}</h3>
            <p class="text-[11px] text-muted-foreground">{{ t('Specify target context for AI chat queries and operations') }}</p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-4 space-y-4">
        <!-- Follow workspace mode toggle card -->
        <div
          @click="followWorkspace = true"
          :class="[
            'p-3 rounded-lg border cursor-pointer transition flex items-start space-x-3',
            followWorkspace
              ? 'border-primary bg-primary/5 text-foreground'
              : 'border-border hover:bg-secondary/50 text-foreground/80',
          ]"
        >
          <div
            :class="[
              'w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0',
              followWorkspace ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground',
            ]"
          >
            <Check v-if="followWorkspace" class="w-2.5 h-2.5 stroke-[3]" />
          </div>
          <div class="flex-1">
            <div class="flex items-center space-x-1.5 font-semibold text-xs">
              <Compass class="w-3.5 h-3.5 text-primary" />
              <span>{{ t('Follow Active Workspace (Recommended)') }}</span>
            </div>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              {{ t('Automatically switches target repository and branch when you navigate in GITBX.') }}
            </p>
            <div v-if="followWorkspace" class="mt-2 text-[11px] font-mono bg-muted/50 p-1.5 rounded border border-border">
              {{ t('Active: {repo} @ {branch}', {
                repo: activeRepoName || t('No repository opened'),
                branch: repoStore.repoInfo?.head_branch || '-',
              }) }}
            </div>
          </div>
        </div>

        <!-- Custom pinned mode card -->
        <div
          @click="followWorkspace = false"
          :class="[
            'p-3 rounded-lg border cursor-pointer transition flex items-start space-x-3',
            !followWorkspace
              ? 'border-primary bg-primary/5 text-foreground'
              : 'border-border hover:bg-secondary/50 text-foreground/80',
          ]"
        >
          <div
            :class="[
              'w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0',
              !followWorkspace ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground',
            ]"
          >
            <Check v-if="!followWorkspace" class="w-2.5 h-2.5 stroke-[3]" />
          </div>
          <div class="flex-1">
            <div class="flex items-center space-x-1.5 font-semibold text-xs">
              <Pin class="w-3.5 h-3.5 text-amber-500" />
              <span>{{ t('Pin to Specific Repository & Branch') }}</span>
            </div>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              {{ t('Keep this chat session bound to a specific repository even if you switch projects.') }}
            </p>

            <!-- Manual select fields -->
            <div v-if="!followWorkspace" class="mt-3 space-y-2" @click.stop>
              <div>
                <label class="text-[11px] font-medium text-muted-foreground block mb-1">
                  {{ t('Repository') }}
                </label>
                <select
                  v-model="selectedRepo"
                  class="w-full text-xs bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option v-for="repo in repoStore.repoList" :key="repo.path" :value="repo.path">
                    {{ repo.name }} ({{ repo.path }})
                  </option>
                </select>
              </div>

              <div>
                <label class="text-[11px] font-medium text-muted-foreground block mb-1">
                  {{ t('Branch') }}
                </label>
                <select
                  v-model="selectedBranch"
                  class="w-full text-xs bg-background border border-border rounded-lg p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option v-for="branch in currentRepoBranches" :key="branch.name" :value="branch.name">
                    {{ branch.is_head ? '★ ' : '' }}{{ branch.name }}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-4 py-2.5 border-t border-border bg-muted/30 flex items-center justify-end space-x-2">
        <button
          @click="emit('close')"
          class="px-3 py-1.5 text-xs rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition"
        >
          {{ t('Cancel') }}
        </button>
        <button
          @click="handleSave"
          class="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition shadow-xs"
        >
          {{ t('Apply Context') }}
        </button>
      </div>
    </div>
  </div>
</Teleport>
</template>
