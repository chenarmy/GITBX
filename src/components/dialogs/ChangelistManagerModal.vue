<script setup lang="ts">
import { computed, ref } from 'vue';
import { ListTodo, Plus, Trash2 } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
import { useRepoStore } from '@/stores/repo';
import { useChangelistStore } from '@/stores/changelist';
import { useI18n } from '@/i18n';
const repoStore = useRepoStore(); const store = useChangelistStore(); const { t } = useI18n(); const newName = ref('');
const files = computed(() => [...new Map([...repoStore.statusSummary.staged_files, ...repoStore.statusSummary.unstaged_files, ...repoStore.statusSummary.untracked_files].map((file) => [file.path, file])).values()]);
function add() { store.create(newName.value); newName.value = ''; }
</script>
<template>
  <ArcoModal
    v-if="store.isManagerOpen"
    :title="t('Changelists')"
    max-width-class="max-w-4xl"
    height-class="h-[65vh]"
    icon-bg-class="bg-violet-500/10 text-violet-500"
    raw-body
    @close="store.isManagerOpen = false"
  >
    <template #icon>
      <ListTodo class="w-4 h-4" aria-hidden="true" />
    </template>

    <div class="flex-1 min-h-0 grid grid-cols-[248px_1fr]">
      <div class="border-r border-border/80 bg-[hsl(var(--arco-fill-1))] flex flex-col">
        <div class="p-3 border-b border-border/80 flex gap-1.5">
          <input
            v-model="newName"
            class="arco-input arco-input-sm min-w-0 flex-1"
            :placeholder="t('New Changelist')"
            @keydown.enter="add"
          />
          <button type="button" class="arco-btn arco-btn-primary arco-btn-sm px-2" @click="add">
            <Plus class="w-3.5 h-3.5" />
          </button>
        </div>
        <div class="flex-1 overflow-auto divide-y divide-border/70">
          <div v-for="list in store.lists" :key="list.id" class="px-3.5 py-2.5 flex justify-between items-center hover:bg-accent/55 transition-colors">
            <span class="flex items-center gap-2 text-foreground font-medium truncate">
              <i class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: list.color }"></i>
              <span class="truncate">{{ t(list.name) }}</span>
            </span>
            <button
              v-if="list.id !== 'default'"
              type="button"
              class="arco-icon-btn-sm text-[hsl(var(--arco-danger))] hover:bg-[hsl(var(--arco-danger)/0.12)]"
              @click="store.remove(list.id)"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div class="overflow-auto">
        <div class="grid grid-cols-[1fr_200px] gap-2 px-4 py-2 bg-[hsl(var(--arco-fill-2))] border-b border-border/80 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
          <span>{{ t('Changed File') }}</span>
          <span>{{ t('Changelist') }}</span>
        </div>
        <div
          v-for="file in files"
          :key="file.path"
          class="grid grid-cols-[1fr_200px] gap-2 px-4 py-2 border-b border-border/70 items-center hover:bg-accent/40 transition-colors"
        >
          <span class="font-mono truncate text-foreground">{{ file.path }}</span>
          <select
            :value="store.activeAssignments[file.path] || 'default'"
            class="arco-select arco-select-sm"
            @change="store.assign(file.path, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="list in store.lists" :key="list.id" :value="list.id">{{ t(list.name) }}</option>
          </select>
        </div>
        <div v-if="files.length === 0" class="p-8 text-center text-muted-foreground">{{ t('No local changes.') }}</div>
      </div>
    </div>
  </ArcoModal>
</template>
