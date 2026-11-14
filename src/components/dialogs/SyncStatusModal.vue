<script setup lang="ts">
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
import { useRepoStore } from '@/stores/repo';
import { useI18n } from '@/i18n';
const repoStore = useRepoStore();
const { t } = useI18n();
async function locate(commitId: string) { await repoStore.locateCommit(commitId); repoStore.closeModal('syncStatus'); }
</script>

<template>
  <ArcoModal
    v-if="repoStore.isSyncStatusOpen"
    :title="t('Incoming and Outgoing Commits')"
    :subtitle="repoStore.syncStatus.upstream || t('No upstream configured')"
    max-width-class="max-w-4xl"
    height-class="h-[65vh]"
    icon-bg-class="bg-[hsl(var(--arco-success)/0.12)] text-[hsl(var(--arco-success))]"
    raw-body
    @close="repoStore.closeModal('syncStatus')"
  >
    <template #icon>
      <ArrowDownCircle class="w-4 h-4" aria-hidden="true" />
    </template>

    <div class="flex-1 min-h-0 grid grid-cols-2 divide-x divide-border/80">
      <section class="flex flex-col min-h-0">
        <header class="px-4 py-2.5 font-semibold text-[hsl(var(--arco-success))] bg-[hsl(var(--arco-fill-1))] border-b border-border/80 flex items-center gap-2 shrink-0">
          <ArrowDownCircle class="w-4 h-4" aria-hidden="true" />
          <span>{{ t('Incoming') }}</span>
          <span class="arco-tag arco-tag-success tabular-nums">{{ repoStore.syncStatus.incoming.length }}</span>
        </header>
        <div class="flex-1 overflow-auto divide-y divide-border/70">
          <button
            v-for="commit in repoStore.syncStatus.incoming"
            :key="commit.id"
            class="w-full text-left px-4 py-2.5 hover:bg-accent/55 transition-colors grid grid-cols-[76px_1fr_120px] gap-2 items-center"
            @click="locate(commit.id)"
          >
            <span class="font-mono text-primary font-medium">{{ commit.short_id }}</span>
            <span class="truncate text-foreground">{{ commit.summary }}</span>
            <span class="truncate text-muted-foreground text-right">{{ commit.author_name }}</span>
          </button>
          <div v-if="repoStore.syncStatus.incoming.length === 0" class="p-8 text-center text-muted-foreground">
            {{ t('No incoming commits.') }}
          </div>
        </div>
      </section>

      <section class="flex flex-col min-h-0">
        <header class="px-4 py-2.5 font-semibold text-primary bg-[hsl(var(--arco-fill-1))] border-b border-border/80 flex items-center gap-2 shrink-0">
          <ArrowUpCircle class="w-4 h-4" aria-hidden="true" />
          <span>{{ t('Outgoing') }}</span>
          <span class="arco-tag arco-tag-primary tabular-nums">{{ repoStore.syncStatus.outgoing.length }}</span>
        </header>
        <div class="flex-1 overflow-auto divide-y divide-border/70">
          <button
            v-for="commit in repoStore.syncStatus.outgoing"
            :key="commit.id"
            class="w-full text-left px-4 py-2.5 hover:bg-accent/55 transition-colors grid grid-cols-[76px_1fr_120px] gap-2 items-center"
            @click="locate(commit.id)"
          >
            <span class="font-mono text-primary font-medium">{{ commit.short_id }}</span>
            <span class="truncate text-foreground">{{ commit.summary }}</span>
            <span class="truncate text-muted-foreground text-right">{{ commit.author_name }}</span>
          </button>
          <div v-if="repoStore.syncStatus.outgoing.length === 0" class="p-8 text-center text-muted-foreground">
            {{ t('No outgoing commits.') }}
          </div>
        </div>
      </section>
    </div>
  </ArcoModal>
</template>
