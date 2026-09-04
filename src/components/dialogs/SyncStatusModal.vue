<script setup lang="ts">
import { ArrowDownCircle, ArrowUpCircle, X } from 'lucide-vue-next';
import { useRepoStore } from '@/stores/repo';
import { useI18n } from '@/i18n';
const repoStore = useRepoStore();
const { t } = useI18n();
async function locate(commitId: string) { await repoStore.locateCommit(commitId); repoStore.isSyncStatusOpen = false; }
</script>

<template>
  <div v-if="repoStore.isSyncStatusOpen" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="w-full max-w-4xl h-[65vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs">
      <div class="h-11 px-4 flex items-center justify-between border-b border-border bg-muted/50">
        <div><span class="font-bold text-sm">{{ t('Incoming and Outgoing Commits') }}</span><span class="ml-2 text-muted-foreground font-mono">{{ repoStore.syncStatus.upstream || t('No upstream configured') }}</span></div>
        <button class="p-1 rounded hover:bg-accent" @click="repoStore.isSyncStatusOpen = false"><X class="w-4 h-4" /></button>
      </div>
      <div class="flex-1 min-h-0 grid grid-cols-2 divide-x divide-border">
        <section class="flex flex-col min-h-0">
          <header class="px-3 py-2 font-bold text-emerald-500 flex gap-2"><ArrowDownCircle class="w-4 h-4" />{{ t('Incoming') }} ({{ repoStore.syncStatus.incoming.length }})</header>
          <div class="overflow-auto divide-y divide-border"><button v-for="commit in repoStore.syncStatus.incoming" :key="commit.id" class="w-full text-left px-3 py-2 hover:bg-accent grid grid-cols-[76px_1fr_120px] gap-2" @click="locate(commit.id)"><span class="font-mono text-primary">{{ commit.short_id }}</span><span class="truncate">{{ commit.summary }}</span><span class="truncate text-muted-foreground">{{ commit.author_name }}</span></button><div v-if="repoStore.syncStatus.incoming.length === 0" class="p-8 text-center text-muted-foreground">{{ t('No incoming commits.') }}</div></div>
        </section>
        <section class="flex flex-col min-h-0">
          <header class="px-3 py-2 font-bold text-emerald-500 flex gap-2"><ArrowUpCircle class="w-4 h-4" />{{ t('Outgoing') }} ({{ repoStore.syncStatus.outgoing.length }})</header>
          <div class="overflow-auto divide-y divide-border"><button v-for="commit in repoStore.syncStatus.outgoing" :key="commit.id" class="w-full text-left px-3 py-2 hover:bg-accent grid grid-cols-[76px_1fr_120px] gap-2" @click="locate(commit.id)"><span class="font-mono text-primary">{{ commit.short_id }}</span><span class="truncate">{{ commit.summary }}</span><span class="truncate text-muted-foreground">{{ commit.author_name }}</span></button><div v-if="repoStore.syncStatus.outgoing.length === 0" class="p-8 text-center text-muted-foreground">{{ t('No outgoing commits.') }}</div></div>
        </section>
      </div>
    </div>
  </div>
</template>
