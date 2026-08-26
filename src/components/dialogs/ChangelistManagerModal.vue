<script setup lang="ts">
import { computed, ref } from 'vue';
import { ListTodo, Plus, Trash2, X } from 'lucide-vue-next';
import { useRepoStore } from '@/stores/repo';
import { useChangelistStore } from '@/stores/changelist';
import { useI18n } from '@/i18n';
const repoStore = useRepoStore(); const store = useChangelistStore(); const { t } = useI18n(); const newName = ref('');
const files = computed(() => [...new Map([...repoStore.statusSummary.staged_files, ...repoStore.statusSummary.unstaged_files, ...repoStore.statusSummary.untracked_files].map((file) => [file.path, file])).values()]);
function add() { store.create(newName.value); newName.value = ''; }
</script>
<template>
  <div v-if="store.isManagerOpen" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="w-full max-w-4xl h-[65vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs">
      <div class="h-11 px-4 flex items-center justify-between border-b border-border bg-muted/50"><div class="flex gap-2"><ListTodo class="w-4 h-4 text-violet-500" /><span class="font-bold text-sm">{{ t('Changelists') }}</span></div><button @click="store.isManagerOpen = false"><X class="w-4 h-4" /></button></div>
      <div class="flex-1 min-h-0 grid grid-cols-[240px_1fr]">
        <div class="border-r border-border flex flex-col"><div class="p-3 flex gap-1"><input v-model="newName" class="min-w-0 flex-1 bg-background border border-border rounded px-2 py-1" :placeholder="t('New Changelist')" @keydown.enter="add" /><button class="p-1 rounded bg-primary text-primary-foreground" @click="add"><Plus class="w-4 h-4" /></button></div><div class="divide-y divide-border"><div v-for="list in store.lists" :key="list.id" class="px-3 py-2 flex justify-between items-center"><span class="flex items-center gap-2"><i class="w-2 h-2 rounded-full" :style="{ backgroundColor: list.color }"></i>{{ t(list.name) }}</span><button v-if="list.id !== 'default'" class="text-rose-500" @click="store.remove(list.id)"><Trash2 class="w-3.5 h-3.5" /></button></div></div></div>
        <div class="overflow-auto"><div class="grid grid-cols-[1fr_200px] px-3 py-2 bg-muted/40 font-bold text-[10px] uppercase text-muted-foreground"><span>{{ t('Changed File') }}</span><span>{{ t('Changelist') }}</span></div><div v-for="file in files" :key="file.path" class="grid grid-cols-[1fr_200px] px-3 py-2 border-b border-border items-center"><span class="font-mono truncate">{{ file.path }}</span><select :value="store.activeAssignments[file.path] || 'default'" class="bg-background border border-border rounded px-2 py-1" @change="store.assign(file.path, ($event.target as HTMLSelectElement).value)"><option v-for="list in store.lists" :key="list.id" :value="list.id">{{ t(list.name) }}</option></select></div><div v-if="files.length === 0" class="p-8 text-center text-muted-foreground">{{ t('No local changes.') }}</div></div>
      </div>
    </div>
  </div>
</template>
