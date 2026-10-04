<script setup lang="ts">
import { computed } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useI18n } from '@/i18n';
import {
  FileText,
  FileCheck,
  AlertTriangle,
  GitCommit,
  GitBranch,
} from 'lucide-vue-next';

interface MentionItem {
  id: string;
  label: string;
  description: string;
  icon: any;
  iconClass: string;
}

const props = defineProps<{
  filter?: string;
}>();

const emit = defineEmits<{
  (e: 'select', item: MentionItem): void;
  (e: 'close'): void;
}>();

const repoStore = useRepoStore();
const { t } = useI18n();

const baseItems: MentionItem[] = [
  {
    id: '@staged',
    label: '@staged',
    description: t('Staged changes ready for commit ({count} files)', {
      count: repoStore.statusSummary.staged_files.length,
    }),
    icon: FileCheck,
    iconClass: 'text-emerald-500',
  },
  {
    id: '@unstaged',
    label: '@unstaged',
    description: t('Unstaged working tree changes ({count} files)', {
      count: repoStore.statusSummary.unstaged_files.length,
    }),
    icon: FileText,
    iconClass: 'text-amber-500',
  },
  {
    id: '@conflicts',
    label: '@conflicts',
    description: t('Merge conflict files ({count} files)', {
      count: repoStore.statusSummary.conflicted_files.length,
    }),
    icon: AlertTriangle,
    iconClass: 'text-rose-500',
  },
  {
    id: '@commits',
    label: '@commits',
    description: t('Recent commit history & graph'),
    icon: GitCommit,
    iconClass: 'text-indigo-500',
  },
  {
    id: '@branches',
    label: '@branches',
    description: t('Local and remote branch list'),
    icon: GitBranch,
    iconClass: 'text-cyan-500',
  },
];

const filteredItems = computed<MentionItem[]>(() => {
  const query = (props.filter || '').toLowerCase().replace(/^@/, '');
  if (!query) return baseItems;

  const results = baseItems.filter(
    (item) =>
      item.id.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query),
  );

  // Also include matching changed files from repo
  const allFiles = [
    ...repoStore.statusSummary.staged_files,
    ...repoStore.statusSummary.unstaged_files,
    ...repoStore.statusSummary.conflicted_files,
  ];
  const uniqueFiles = Array.from(new Set(allFiles.map((f) => f.path)));

  for (const filePath of uniqueFiles) {
    if (filePath.toLowerCase().includes(query)) {
      results.push({
        id: `@file:${filePath}`,
        label: `@${filePath}`,
        description: t('File in working repository'),
        icon: FileText,
        iconClass: 'text-muted-foreground',
      });
      if (results.length >= 10) break;
    }
  }

  return results;
});
</script>

<template>
  <div
    class="bg-popover border border-border rounded-lg shadow-xl overflow-hidden py-1 w-72 max-h-60 overflow-y-auto z-50 animate-in fade-in zoom-in-95 duration-100"
  >
    <div class="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground border-b border-border/50 uppercase tracking-wider">
      {{ t('Insert Git Context') }}
    </div>
    <div v-if="filteredItems.length === 0" class="px-3 py-2 text-xs text-muted-foreground">
      {{ t('No matching context') }}
    </div>
    <button
      v-for="item in filteredItems"
      :key="item.id"
      @click="emit('select', item)"
      class="w-full px-2.5 py-1.5 flex items-center space-x-2 text-left hover:bg-accent/80 transition text-xs group"
    >
      <component :is="item.icon" class="w-3.5 h-3.5 shrink-0" :class="item.iconClass" />
      <div class="min-w-0 flex-1">
        <div class="font-mono font-medium text-foreground text-xs truncate group-hover:text-primary transition">
          {{ item.label }}
        </div>
        <div class="text-[10px] text-muted-foreground truncate">
          {{ item.description }}
        </div>
      </div>
    </button>
  </div>
</template>
