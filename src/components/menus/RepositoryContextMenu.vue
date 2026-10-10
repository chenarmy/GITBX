<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { Code2, FolderOpen, Terminal } from 'lucide-vue-next';
import { useGitApi, formatGitError } from '@/composables/useGitApi';
import { useNotificationStore } from '@/stores/notification';
import { useI18n } from '@/i18n';

const props = defineProps<{ path: string; x: number; y: number }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const gitApi = useGitApi();
const notification = useNotificationStore();
const { t } = useI18n();

const menuStyle = computed(() => ({
  left: `${Math.max(8, Math.min(props.x, window.innerWidth - 216))}px`,
  top: `${Math.max(8, Math.min(props.y, window.innerHeight - 160))}px`,
}));

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
      class="fixed z-50 w-52 rounded-lg border border-border bg-popover py-1 text-xs text-foreground shadow-2xl select-none"
      :style="menuStyle"
      role="menu"
      @click.stop
      @contextmenu.prevent
    >
      <button role="menuitem" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary" @click="openEditor('vscode')">
        <Code2 class="h-3.5 w-3.5 text-sky-500" />
        <span>Visual Studio Code</span>
      </button>
      <button role="menuitem" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary" @click="openEditor('idea')">
        <Code2 class="h-3.5 w-3.5 text-violet-500" />
        <span>IntelliJ IDEA</span>
      </button>
      <button role="menuitem" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary" @click="openTerminal">
        <Terminal class="h-3.5 w-3.5" />
        <span>{{ t('Open System Terminal') }}</span>
      </button>
      <button role="menuitem" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary" @click="openFileManager">
        <FolderOpen class="h-3.5 w-3.5" />
        <span>{{ t('Open File Explorer') }}</span>
      </button>
    </div>
  </Teleport>
</template>
