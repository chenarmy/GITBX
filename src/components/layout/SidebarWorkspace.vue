<script setup lang="ts">
import { ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import type { BranchItem } from '@/types/git';
import BranchContextMenu from '@/components/menus/BranchContextMenu.vue';
import {
  FolderGit2,
  GitBranch,
  Globe,
  Tag,
  Archive,
  ChevronDown,
  ChevronRight,
  Plus,
  Check,
  Trash2,
  MoreVertical,
} from 'lucide-vue-next';

const repoStore = useRepoStore();

const isReposOpen = ref(true);
const isBranchesOpen = ref(true);
const isRemotesOpen = ref(true);
const isTagsOpen = ref(true);
const isStashesOpen = ref(true);

const contextMenu = ref<{ branch: BranchItem; x: number; y: number } | null>(null);

function handleCheckout(name: string) {
  repoStore.checkoutBranch(name);
}

function openContextMenu(e: MouseEvent, branch: BranchItem) {
  e.preventDefault();
  contextMenu.value = {
    branch,
    x: e.clientX,
    y: e.clientY,
  };
}
</script>

<template>
  <aside class="dbx-sidebar w-60 bg-muted/30 dark:bg-card border-r border-border flex flex-col select-none overflow-y-auto text-xs">
    <!-- Repositories Section (SourceTree style) -->
    <div class="p-2 border-b border-border">
      <div
        @click="isReposOpen = !isReposOpen"
        class="dbx-section-heading flex items-center justify-between text-muted-foreground font-bold px-1.5 mb-1 text-[10px] tracking-wider uppercase cursor-pointer hover:text-foreground"
      >
        <div class="flex items-center space-x-1">
          <component :is="isReposOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
          <span>Repositories ({{ repoStore.repoList.length }})</span>
        </div>
        <button
          @click.stop="repoStore.isAddRepoModalOpen = true"
          class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          title="Add Repository"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>

      <div v-if="isReposOpen" class="space-y-0.5">
        <div
          v-for="repo in repoStore.repoList"
          :key="repo.path"
          @click="repoStore.switchRepo(repo.path)"
          class="flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition text-xs group"
          :class="repoStore.activeRepoPath === repo.path ? 'bg-primary/10 text-primary font-bold border border-primary/30 shadow-xs' : 'text-foreground hover:bg-secondary'"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <FolderGit2 class="w-3.5 h-3.5 shrink-0" :class="repoStore.activeRepoPath === repo.path ? 'text-primary' : 'text-muted-foreground'" />
            <span class="truncate">{{ repo.name }}</span>
          </div>

          <button
            v-if="repoStore.repoList.length > 1"
            @click.stop="repoStore.removeRepo(repo.path)"
            class="p-0.5 rounded hover:bg-destructive/20 hover:text-rose-600 text-muted-foreground opacity-0 group-hover:opacity-100 transition"
            title="Remove from Workspace"
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- Local Branches Section -->
    <div class="p-2 border-b border-border">
      <div
        @click="isBranchesOpen = !isBranchesOpen"
        class="dbx-section-heading flex items-center justify-between text-muted-foreground font-bold px-1.5 py-0.5 cursor-pointer hover:text-foreground text-[10px] tracking-wider uppercase"
      >
        <div class="flex items-center space-x-1">
          <component :is="isBranchesOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
          <span>Local Branches ({{ repoStore.branches.filter(b => !b.is_remote).length }})</span>
        </div>
        <button
          @click.stop="repoStore.isBranchModalOpen = true"
          class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          title="Create Branch"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>

      <div v-if="isBranchesOpen" class="mt-1 space-y-0.5">
        <div
          v-for="branch in repoStore.branches.filter(b => !b.is_remote)"
          :key="branch.name"
          @dblclick="handleCheckout(branch.name)"
          @click="handleCheckout(branch.name)"
          @contextmenu.prevent="openContextMenu($event, branch)"
          class="flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition text-xs group"
          :class="branch.is_head ? 'bg-primary/10 text-primary font-bold border-l-2 border-primary shadow-xs' : 'text-foreground hover:bg-secondary'"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <GitBranch class="w-3.5 h-3.5 shrink-0" :class="branch.is_head ? 'text-primary' : 'text-muted-foreground'" />
            <span class="truncate">{{ branch.name }}</span>
          </div>

          <div class="flex items-center space-x-1">
            <Check v-if="branch.is_head" class="w-3.5 h-3.5 text-primary shrink-0 font-bold" />
            <button
              @click.stop="openContextMenu($event, branch)"
              class="p-0.5 rounded hover:bg-secondary text-muted-foreground opacity-0 group-hover:opacity-100 transition"
              title="More actions"
            >
              <MoreVertical class="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Remote Branches Section -->
    <div class="p-2 border-b border-border">
      <div
        @click="isRemotesOpen = !isRemotesOpen"
        class="dbx-section-heading flex items-center justify-between text-muted-foreground font-bold px-1.5 py-0.5 cursor-pointer hover:text-foreground text-[10px] tracking-wider uppercase"
      >
        <div class="flex items-center space-x-1">
          <component :is="isRemotesOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
          <span>Remote Branches ({{ repoStore.branches.filter(b => b.is_remote).length }})</span>
        </div>
      </div>

      <div v-if="isRemotesOpen" class="mt-1 space-y-0.5 text-muted-foreground">
        <div
          v-for="branch in repoStore.branches.filter(b => b.is_remote)"
          :key="branch.name"
          @dblclick="handleCheckout(branch.name)"
          @contextmenu.prevent="openContextMenu($event, branch)"
          class="flex items-center space-x-1.5 px-2 py-1 rounded-md hover:bg-secondary hover:text-foreground cursor-pointer truncate text-xs"
        >
          <Globe class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 opacity-80 shrink-0" />
          <span class="truncate">{{ branch.name }}</span>
        </div>
      </div>
    </div>

    <!-- Tags Section -->
    <div class="p-2 border-b border-border">
      <div
        @click="isTagsOpen = !isTagsOpen"
        class="dbx-section-heading flex items-center justify-between text-muted-foreground font-bold px-1.5 py-0.5 cursor-pointer hover:text-foreground text-[10px] tracking-wider uppercase"
      >
        <div class="flex items-center space-x-1">
          <component :is="isTagsOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
          <span>Tags ({{ repoStore.tags.length }})</span>
        </div>
        <button
          @click.stop="repoStore.isTagModalOpen = true"
          class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          title="Create Tag"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>

      <div v-if="isTagsOpen" class="mt-1 space-y-0.5 text-muted-foreground">
        <div
          v-for="tag in repoStore.tags"
          :key="tag.name"
          class="flex items-center space-x-1.5 px-2 py-1 rounded-md hover:bg-secondary hover:text-foreground cursor-pointer truncate text-xs"
        >
          <Tag class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 opacity-80 shrink-0" />
          <span class="truncate">{{ tag.name }}</span>
        </div>
      </div>
    </div>

    <!-- Stashes Section -->
    <div class="p-2">
      <div
        @click="isStashesOpen = !isStashesOpen"
        class="dbx-section-heading flex items-center justify-between text-muted-foreground font-bold px-1.5 py-0.5 cursor-pointer hover:text-foreground text-[10px] tracking-wider uppercase"
      >
        <div class="flex items-center space-x-1">
          <component :is="isStashesOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
          <span>Stashes ({{ repoStore.stashes.length }})</span>
        </div>
        <button
          @click.stop="repoStore.isStashModalOpen = true"
          class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          title="Save Stash"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>

      <div v-if="isStashesOpen" class="mt-1 space-y-0.5 text-muted-foreground">
        <div
          v-for="stash in repoStore.stashes"
          :key="stash.index"
          @click="repoStore.popStash(stash.index)"
          class="flex items-center justify-between px-2 py-1 rounded-md hover:bg-secondary hover:text-foreground cursor-pointer truncate group text-xs"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <Archive class="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 opacity-80 shrink-0" />
            <span class="truncate">{{ stash.message }}</span>
          </div>
          <span class="text-[10px] text-primary font-bold opacity-0 group-hover:opacity-100">Pop</span>
        </div>
      </div>
    </div>

    <!-- Context Menu -->
    <BranchContextMenu
      v-if="contextMenu"
      :branch="contextMenu.branch"
      :x="contextMenu.x"
      :y="contextMenu.y"
      @close="contextMenu = null"
    />
  </aside>
</template>
