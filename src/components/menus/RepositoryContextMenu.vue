<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { Check, Code2, Folder, FolderMinus, FolderOpen, FolderPlus, Terminal, Trash2 } from 'lucide-vue-next';
import { useGitApi, formatGitError } from '@/composables/useGitApi';
import { useRepoStore } from '@/stores/repo';
import { useNotificationStore } from '@/stores/notification';
import { useConfirmationStore } from '@/stores/confirmation';
import { useI18n } from '@/i18n';

const props = defineProps<{ path: string; x: number; y: number }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const gitApi = useGitApi();
const repoStore = useRepoStore();
const notification = useNotificationStore();
const confirmation = useConfirmationStore();
const { t } = useI18n();

const currentRepo = computed(() => repoStore.repoList.find((r) => r.path === props.path));
const currentGroup = computed(() => currentRepo.value?.group || '');

const allGroups = computed(() => {
  const groups = [...repoStore.repoGroups];
  const seen = new Set(groups);
  for (const repo of repoStore.repoList) {
    if (repo.group && !seen.has(repo.group)) {
      seen.add(repo.group);
      groups.push(repo.group);
    }
  }
  return groups;
});

const menuStyle = computed(() => {
  const estimatedHeight = 220 + allGroups.value.length * 28;
  return {
    left: `${Math.max(8, Math.min(props.x, window.innerWidth - 230))}px`,
    top: `${Math.max(8, Math.min(props.y, window.innerHeight - Math.min(estimatedHeight, 380)))}px`,
  };
});

function assignToGroup(groupName: string | null) {
  repoStore.setRepoGroup(props.path, groupName);
  emit('close');
}

async function createAndAssignGroup() {
  const path = props.path;
  emit('close');
  const name = await confirmation.prompt({
    title: t('New Group'),
    message: t('Enter a name for the new repository group.'),
    inputLabel: t('Group Name'),
    confirmText: t('Create'),
  });
  const cleanName = name?.trim();
  if (!cleanName) return;
  const created = repoStore.createRepoGroup(cleanName);
  if (created) {
    repoStore.setRepoGroup(path, created);
    notification.success(t('Group Created'), created);
  }
}

function removeFromWorkspace() {
  const path = props.path;
  emit('close');
  repoStore.removeRepo(path);
}

async function openEditor(editor: 'vscode' | 'idea') {
  const path = props.path;
  const editorName = editor === 'vscode' ? 'Visual Studio Code' : 'IntelliJ IDEA';
  emit('close');
  try {
    await gitApi.openInEditor(path, editor);
    notification.success(t('Editor Opened'), t('Opened {path} in {editor}', { path, editor: editorName }));
  } catch (error) {
    notification.error(t('Failed to Open Editor'), formatGitError(error, t('Could not open {editor}. Make sure it is installed.', { editor: editorName })));
  }
}

async function openTerminal() {
  const path = props.path;
  emit('close');
  try {
    await gitApi.openSystemTerminal(path);
    notification.success(t('System Terminal Opened'), t('Opened terminal in {path}', { path }));
  } catch (error) {
    notification.error(t('Failed to Open System Terminal'), formatGitError(error, t('Could not open a terminal for the current repository.')));
  }
}

async function openFileManager() {
  const path = props.path;
  emit('close');
  try {
    await gitApi.openFileManager(path);
    notification.success(t('File Explorer Opened'), t('Opened file manager in {path}', { path }));
  } catch (error) {
    notification.error(t('Failed to Open File Explorer'), formatGitError(error, t('Could not open the file manager for the current repository.')));
  }
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => {
  window.addEventListener('click', closeMenu);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('scroll', closeMenu, true);
});

onUnmounted(() => {
  window.removeEventListener('click', closeMenu);
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('scroll', closeMenu, true);
});

function closeMenu() {
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed z-50 w-56 rounded-lg border border-border bg-popover py-1 text-xs text-foreground shadow-2xl select-none divide-y divide-border/60"
      :style="menuStyle"
      role="menu"
      @click.stop
      @contextmenu.prevent
    >
      <div class="py-1">
        <button role="menuitem" class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary" @click="openEditor('vscode')">
          <Code2 class="h-3.5 w-3.5 text-sky-500" />
          <span>Visual Studio Code</span>
        </button>
        <button role="menuitem" class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary" @click="openEditor('idea')">
          <Code2 class="h-3.5 w-3.5 text-violet-500" />
          <span>IntelliJ IDEA</span>
        </button>
        <button role="menuitem" class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary" @click="openTerminal">
          <Terminal class="h-3.5 w-3.5" />
          <span>{{ t('Open System Terminal') }}</span>
        </button>
        <button role="menuitem" class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary" @click="openFileManager">
          <FolderOpen class="h-3.5 w-3.5" />
          <span>{{ t('Open File Explorer') }}</span>
        </button>
      </div>

      <!-- Group Assignment Section -->
      <div class="py-1">
        <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {{ t('Repository Group') }}
        </div>
        <div v-if="allGroups.length > 0" class="max-h-36 overflow-y-auto">
          <button
            v-for="group in allGroups"
            :key="group"
            role="menuitem"
            class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-secondary"
            :class="currentGroup === group ? 'text-primary font-semibold' : ''"
            @click="assignToGroup(group)"
          >
            <span class="flex min-w-0 items-center gap-2 truncate">
              <Folder class="h-3.5 w-3.5 shrink-0 text-amber-500/90" />
              <span class="truncate">{{ group }}</span>
            </span>
            <Check v-if="currentGroup === group" class="h-3.5 w-3.5 shrink-0 text-primary" />
          </button>
        </div>
        <button
          role="menuitem"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary text-primary font-medium"
          @click="createAndAssignGroup"
        >
          <FolderPlus class="h-3.5 w-3.5" />
          <span>{{ t('New Group...') }}</span>
        </button>
        <button
          v-if="currentGroup"
          role="menuitem"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary text-muted-foreground hover:text-foreground"
          @click="assignToGroup(null)"
        >
          <FolderMinus class="h-3.5 w-3.5" />
          <span>{{ t('Remove from Group') }}</span>
        </button>
      </div>

      <div v-if="repoStore.repoList.length > 1" class="py-1">
        <button
          role="menuitem"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-destructive/20"
          @click="removeFromWorkspace"
        >
          <Trash2 class="h-3.5 w-3.5" />
          <span>{{ t('Remove from Workspace') }}</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>
