<script setup lang="ts">
import { ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import {
  FolderGit2,
  GitBranch,
  Globe,
  Tag,
  ChevronDown,
  ChevronRight,
  Plus,
  Check,
} from 'lucide-vue-next';

const repoStore = useRepoStore();

const isBranchesOpen = ref(true);
const isRemotesOpen = ref(true);
const isTagsOpen = ref(true);
const isStashesOpen = ref(false);
</script>

<template>
  <aside class="w-56 bg-muted/20 border-r border-border flex flex-col select-none overflow-y-auto text-xs">
    <!-- Repositories Section -->
    <div class="p-2 border-b border-border">
      <div class="flex items-center justify-between text-muted-foreground font-semibold px-1 mb-1 text-[10px] tracking-wider uppercase">
        <span>Workspace</span>
        <Plus class="w-3.5 h-3.5 hover:text-foreground cursor-pointer" />
      </div>
      <div class="flex items-center space-x-2 px-2 py-1.5 rounded bg-primary/10 text-primary font-medium cursor-pointer border border-primary/20">
        <FolderGit2 class="w-3.5 h-3.5" />
        <span class="truncate">{{ repoStore.repoInfo?.name || 'GITBX' }}</span>
      </div>
    </div>

    <!-- Branches Section -->
    <div class="p-2 border-b border-border">
      <div
        @click="isBranchesOpen = !isBranchesOpen"
        class="flex items-center justify-between text-muted-foreground font-semibold px-1 py-1 cursor-pointer hover:text-foreground text-[10px] tracking-wider uppercase"
      >
        <div class="flex items-center space-x-1">
          <component :is="isBranchesOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
          <span>Local Branches ({{ repoStore.branches.length }})</span>
        </div>
        <Plus class="w-3.5 h-3.5 hover:text-foreground" />
      </div>

      <div v-if="isBranchesOpen" class="mt-1 space-y-0.5">
        <div
          v-for="branch in repoStore.branches"
          :key="branch.name"
          class="flex items-center justify-between px-2 py-1 rounded cursor-pointer transition text-xs"
          :class="branch.is_head ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <GitBranch class="w-3.5 h-3.5" :class="branch.is_head ? 'text-blue-400' : 'opacity-60'" />
            <span class="truncate">{{ branch.name }}</span>
          </div>
          <Check v-if="branch.is_head" class="w-3 h-3 text-blue-400 shrink-0" />
        </div>
      </div>
    </div>

    <!-- Remotes Section -->
    <div class="p-2 border-b border-border">
      <div
        @click="isRemotesOpen = !isRemotesOpen"
        class="flex items-center justify-between text-muted-foreground font-semibold px-1 py-1 cursor-pointer hover:text-foreground text-[10px] tracking-wider uppercase"
      >
        <div class="flex items-center space-x-1">
          <component :is="isRemotesOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
          <span>Remotes</span>
        </div>
      </div>

      <div v-if="isRemotesOpen" class="mt-1 space-y-0.5 text-muted-foreground">
        <div class="flex items-center space-x-1.5 px-2 py-1 rounded hover:bg-accent hover:text-foreground cursor-pointer">
          <Globe class="w-3.5 h-3.5 text-emerald-400 opacity-70" />
          <span>origin/main</span>
        </div>
      </div>
    </div>

    <!-- Tags Section -->
    <div class="p-2 border-b border-border">
      <div
        @click="isTagsOpen = !isTagsOpen"
        class="flex items-center justify-between text-muted-foreground font-semibold px-1 py-1 cursor-pointer hover:text-foreground text-[10px] tracking-wider uppercase"
      >
        <div class="flex items-center space-x-1">
          <component :is="isTagsOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
          <span>Tags (1)</span>
        </div>
      </div>

      <div v-if="isTagsOpen" class="mt-1 space-y-0.5 text-muted-foreground">
        <div class="flex items-center space-x-1.5 px-2 py-1 rounded hover:bg-accent hover:text-foreground cursor-pointer">
          <Tag class="w-3.5 h-3.5 text-amber-400 opacity-70" />
          <span>v0.1.0</span>
        </div>
      </div>
    </div>

    <!-- Stashes Section -->
    <div class="p-2">
      <div
        @click="isStashesOpen = !isStashesOpen"
        class="flex items-center justify-between text-muted-foreground font-semibold px-1 py-1 cursor-pointer hover:text-foreground text-[10px] tracking-wider uppercase"
      >
        <div class="flex items-center space-x-1">
          <component :is="isStashesOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
          <span>Stashes (0)</span>
        </div>
      </div>
    </div>
  </aside>
</template>
