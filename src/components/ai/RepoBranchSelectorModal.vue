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
      class="fixed arco-modal-backdrop z-[100] select-none"
      @click.self="emit('close')"
      @keydown.esc.window="emit('close')"
    >
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="t('Context Repository & Branch')"
        class="arco-modal max-w-md select-text"
        @click.stop
      >
      <!-- Modal Header -->
      <div class="arco-modal-header">
        <div class="arco-modal-title-group">
          <div class="arco-modal-icon">
            <Compass class="w-4 h-4" />
          </div>
          <div class="min-w-0">
            <h3 class="arco-modal-title">{{ t('Context Repository & Branch') }}</h3>
            <p class="text-[11px] text-muted-foreground truncate">{{ t('Specify target context for AI chat queries and operations') }}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close dialog"
          @click="emit('close')"
          class="arco-modal-close"
        >
          <X class="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <!-- Content -->
      <div class="arco-modal-body space-y-3">
        <!-- Follow workspace mode toggle card -->
        <div
          @click="followWorkspace = true"
          :class="[
            'p-3.5 rounded-[6px] border cursor-pointer transition-colors flex items-start gap-3',
            followWorkspace
              ? 'border-primary bg-primary/[0.06] text-foreground'
              : 'border-border hover:bg-accent/50 text-foreground/85',
          ]"
        >
          <div
            :class="[
              'w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 transition-colors',
              followWorkspace ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
            ]"
          >
            <Check v-if="followWorkspace" class="w-2.5 h-2.5" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 font-semibold text-xs">
              <Compass class="w-3.5 h-3.5 text-primary" />
              <span>{{ t('Follow Active Workspace (Recommended)') }}</span>
            </div>
            <p class="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              {{ t('Automatically switches target repository and branch when you navigate in GITBX.') }}
            </p>
            <div v-if="followWorkspace" class="mt-2 text-[11px] font-mono bg-muted/60 px-2.5 py-1.5 rounded-[4px] border border-border truncate">
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
            'p-3.5 rounded-[6px] border cursor-pointer transition-colors flex items-start gap-3',
            !followWorkspace
              ? 'border-primary bg-primary/[0.06] text-foreground'
              : 'border-border hover:bg-accent/50 text-foreground/85',
          ]"
        >
          <div
            :class="[
              'w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 transition-colors',
              !followWorkspace ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
            ]"
          >
            <Check v-if="!followWorkspace" class="w-2.5 h-2.5" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 font-semibold text-xs">
              <Pin class="w-3.5 h-3.5 text-amber-500" />
              <span>{{ t('Pin to Specific Repository & Branch') }}</span>
            </div>
            <p class="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              {{ t('Keep this chat session bound to a specific repository even if you switch projects.') }}
            </p>

            <!-- Manual select fields -->
            <div v-if="!followWorkspace" class="mt-3 space-y-2.5" @click.stop>
              <div>
                <label class="text-[11px] font-medium text-muted-foreground block mb-1">
                  {{ t('Repository') }}
                </label>
                <select
                  v-model="selectedRepo"
                  class="arco-select"
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
                  class="arco-select"
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
      <div class="arco-modal-footer">
        <button
          @click="emit('close')"
          class="arco-btn arco-btn-secondary"
        >
          {{ t('Cancel') }}
        </button>
        <button
          @click="handleSave"
          class="arco-btn arco-btn-primary"
        >
          {{ t('Apply Context') }}
        </button>
      </div>
    </div>
  </div>
</Teleport>
</template>
