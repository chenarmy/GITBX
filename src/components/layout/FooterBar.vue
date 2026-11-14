<script setup lang="ts">
import { ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useConsoleStore } from '@/stores/console';
import { useNotificationStore } from '@/stores/notification';
import { formatGitError, useGitApi } from '@/composables/useGitApi';
import { useI18n } from '@/i18n';
import {
  FolderGit2,
  GitBranch,
  Terminal,
  CheckCircle2,
} from 'lucide-vue-next';

const repoStore = useRepoStore();
const consoleStore = useConsoleStore();
const notification = useNotificationStore();
const gitApi = useGitApi();
const { t } = useI18n();
const isOpeningFileManager = ref(false);

async function handleOpenFileManager() {
  const repoPath = repoStore.activeRepoPath;
  if (!repoPath || isOpeningFileManager.value) return;

  isOpeningFileManager.value = true;
  try {
    await gitApi.openFileManager(repoPath);
  } catch (error) {
    notification.error(
      t('Failed to Open File Explorer'),
      formatGitError(error, t('Could not open the file manager for the current repository.')),
    );
  } finally {
    isOpeningFileManager.value = false;
  }
}
</script>

<template>
  <footer class="dbx-footer h-6 bg-card border-t border-border flex items-center justify-between px-3 text-[11px] select-none text-muted-foreground z-30">
    <!-- Left: Repo & Branch Status -->
    <div class="flex items-center gap-2.5 min-w-0">
      <button
        @click="handleOpenFileManager"
        :disabled="!repoStore.activeRepoPath || isOpeningFileManager"
        class="flex items-center gap-1.5 font-medium text-foreground truncate max-w-xs rounded-[4px] px-1.5 py-0.5 -ml-1.5 hover:bg-accent hover:text-primary transition-colors disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-foreground"
        :title="repoStore.activeRepoPath ? t('Open File Explorer') : t('No repository opened')"
      >
        <FolderGit2 class="w-3 h-3 text-primary shrink-0" />
        <span class="truncate">{{ repoStore.repoInfo?.path || t('No repository opened') }}</span>
      </button>

      <div class="h-3 w-px bg-border shrink-0"></div>

      <div class="flex items-center gap-1 font-mono text-[11px] font-medium text-foreground shrink-0">
        <GitBranch class="w-3 h-3 text-primary shrink-0" />
        <span>{{ repoStore.repoInfo?.head_branch || 'HEAD' }}</span>
      </div>
    </div>

    <!-- Right: Console Toggle & Status -->
    <div class="flex items-center gap-2.5 shrink-0">
      <!-- Toggle Console Drawer Button -->
      <button
        @click="consoleStore.toggleConsole()"
        class="flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] hover:bg-accent transition-colors font-medium text-foreground"
        :class="{ 'bg-primary/10 text-primary': consoleStore.isOpen }"
        :title="t('Output & Operation Console') + ' (Ctrl+`)'"
      >
        <Terminal class="w-3 h-3 text-primary" />
        <span>{{ t('Console') }}</span>
        <span
          v-if="consoleStore.logs.length > 0"
          class="px-1.5 py-0 rounded-full text-[9px] font-semibold tabular-nums"
          :class="consoleStore.logs.some(l => l.level === 'error') ? 'bg-destructive/15 text-destructive' : 'bg-secondary text-muted-foreground'"
        >
          {{ consoleStore.logs.length }}
        </span>
      </button>

      <div class="h-3 w-px bg-border"></div>

      <!-- Engine Status -->
      <div class="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
        <CheckCircle2 class="w-3 h-3" />
        <span>{{ t('Git Engine Online') }}</span>
      </div>
    </div>
  </footer>
</template>
