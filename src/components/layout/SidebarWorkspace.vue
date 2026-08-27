<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import type { BranchItem } from '@/types/git';
import BranchContextMenu from '@/components/menus/BranchContextMenu.vue';
import { useI18n } from '@/i18n';
import { useNotificationStore } from '@/stores/notification';
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
  GitFork,
  FolderTree,
} from 'lucide-vue-next';

const repoStore = useRepoStore();
const { t } = useI18n();
const notification = useNotificationStore();

async function discoverRoots() {
  try { const count = await repoStore.discoverRoots(); notification.success(t('Git Roots Discovered'), t('Found {count} Git roots.', { count })); }
  catch (error: any) { notification.error(t('Discovery Failed'), error?.message || String(error)); }
}

const isReposOpen = ref(true);
const isBranchesOpen = ref(true);
const isRemotesOpen = ref(true);
const isTagsOpen = ref(true);
const isStashesOpen = ref(true);

const contextMenu = ref<{ branch: BranchItem; x: number; y: number } | null>(null);

interface BranchGroup {
  name: string;
  branches: BranchItem[];
}

function groupBranches(branches: BranchItem[]): BranchGroup[] {
  const groups = new Map<string, BranchItem[]>();
  for (const branch of branches) {
    const slash = branch.name.indexOf('/');
    const groupName = slash > 0 ? branch.name.slice(0, slash) : '';
    const items = groups.get(groupName) || [];
    items.push(branch);
    groups.set(groupName, items);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, items]) => ({ name, branches: items.sort((a, b) => a.name.localeCompare(b.name)) }));
}

const localBranchGroups = computed(() => groupBranches(repoStore.branches.filter((branch) => !branch.is_remote)));
const remoteBranchGroups = computed(() =>
  groupBranches(
    repoStore.branches.filter(
      (branch) => branch.is_remote && !branch.name.endsWith('/HEAD') && branch.name !== 'HEAD'
    )
  )
);

function handleCheckout(name: string) {
  repoStore.checkoutBranch(name);
}

function handleLocateCommit(commitId: string) {
  void repoStore.locateCommit(commitId);
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
  <aside class="dbx-sidebar w-60 h-full max-h-full min-h-0 self-stretch shrink-0 bg-muted/30 dark:bg-card border-r border-border flex flex-col select-none overflow-hidden text-xs">
    <div class="flex-1 min-h-0 overflow-y-scroll overflow-x-hidden overscroll-contain">
    <!-- Repositories Section (SourceTree style) -->
    <div class="p-2 border-b border-border">
      <div
        @click="isReposOpen = !isReposOpen"
        class="dbx-section-heading flex items-center justify-between text-muted-foreground font-bold px-1.5 mb-1 text-[10px] tracking-wider uppercase cursor-pointer hover:text-foreground"
      >
        <div class="flex items-center space-x-1">
          <button @click.stop="discoverRoots" :disabled="!repoStore.activeRepoPath" class="p-0.5 rounded hover:bg-secondary text-muted-foreground disabled:opacity-40" :title="t('Discover Nested Git Roots')"><FolderTree class="w-3.5 h-3.5" /></button>
          <component :is="isReposOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
          <span>{{ t('Repositories') }} ({{ repoStore.repoList.length }})</span>
        </div>
        <div class="flex items-center space-x-1">
          <button
            @click.stop="repoStore.isRemoteModalOpen = true"
            :disabled="!repoStore.activeRepoPath"
            class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            :title="t('View and edit Git remotes')"
          >
            <GitFork class="w-3.5 h-3.5" />
          </button>
          <button
            @click.stop="repoStore.isAddRepoModalOpen = true"
            class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            :title="t('Add Repository')"
          >
            <Plus class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div v-if="isReposOpen" class="space-y-0.5">
        <div
          v-for="repo in repoStore.repoList"
          :key="repo.path"
          @click="repoStore.switchRepo(repo.path)"
          class="flex min-w-0 items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition text-xs group"
          :class="repoStore.activeRepoPath === repo.path ? 'bg-primary/10 text-primary font-bold border border-primary/30 shadow-xs' : 'text-foreground hover:bg-secondary'"
        >
          <div class="flex min-w-0 flex-1 items-center space-x-1.5 overflow-hidden">
            <FolderGit2 class="w-3.5 h-3.5 shrink-0" :class="repoStore.activeRepoPath === repo.path ? 'text-primary' : 'text-muted-foreground'" />
            <span class="min-w-0 truncate">{{ repo.name }}</span>
          </div>

          <button
            v-if="repoStore.repoList.length > 1"
            @click.stop="repoStore.removeRepo(repo.path)"
            class="ml-1 shrink-0 p-0.5 rounded hover:bg-destructive/20 hover:text-rose-600 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
            :title="t('Remove from Workspace')"
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
          <span>{{ t('Local Branches') }} ({{ repoStore.branches.filter(b => !b.is_remote).length }})</span>
        </div>
        <button
          @click.stop="repoStore.isBranchModalOpen = true"
          class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          :title="t('Create Branch')"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>

      <div v-if="isBranchesOpen" class="mt-1 space-y-1">
        <div v-for="group in localBranchGroups" :key="group.name || '__root'">
          <div v-if="group.name" class="flex items-center space-x-1 px-2 text-[10px] text-muted-foreground/80 font-semibold">
            <FolderTree class="w-3 h-3" />
            <span class="truncate">{{ group.name }}/</span>
          </div>
          <div
            v-for="branch in group.branches"
            :key="branch.name"
            @dblclick="handleCheckout(branch.name)"
            @click="handleLocateCommit(branch.target_commit_id)"
            @contextmenu.prevent="openContextMenu($event, branch)"
            :title="t('Click to locate in log; double-click to checkout')"
            class="flex min-w-0 items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition text-xs group"
            :class="[branch.is_head ? 'bg-primary/10 text-primary font-bold border-l-2 border-primary shadow-xs' : 'text-foreground hover:bg-secondary', group.name ? 'pl-5' : '']"
          >
            <div class="flex min-w-0 flex-1 items-center space-x-1.5 overflow-hidden">
              <GitBranch class="w-3.5 h-3.5 shrink-0" :class="branch.is_head ? 'text-primary' : 'text-muted-foreground'" />
              <span class="min-w-0 truncate">{{ group.name ? branch.name.slice(group.name.length + 1) : branch.name }}</span>
            </div>

            <div class="ml-1 flex shrink-0 items-center space-x-1">
              <Check v-if="branch.is_head" class="w-3.5 h-3.5 text-primary shrink-0 font-bold" />
              <button
                @click.stop="openContextMenu($event, branch)"
                class="shrink-0 p-0.5 rounded hover:bg-secondary text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                :title="t('More actions')"
              >
                <MoreVertical class="w-3 h-3" />
              </button>
            </div>
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
          <span>{{ t('Remote Branches') }} ({{ repoStore.branches.filter(b => b.is_remote && !b.name.endsWith('/HEAD') && b.name !== 'HEAD').length }})</span>
        </div>
      </div>

      <div v-if="isRemotesOpen" class="mt-1 space-y-1 text-muted-foreground">
        <div v-for="group in remoteBranchGroups" :key="group.name || '__root'">
          <div v-if="group.name" class="flex items-center space-x-1 px-2 text-[10px] text-muted-foreground/80 font-semibold">
            <FolderTree class="w-3 h-3" />
            <span class="truncate">{{ group.name }}/</span>
          </div>
          <div
            v-for="branch in group.branches"
            :key="branch.name"
            @dblclick="handleCheckout(branch.name)"
            @click="handleLocateCommit(branch.target_commit_id)"
            @contextmenu.prevent="openContextMenu($event, branch)"
            :title="t('Click to locate in log; double-click to checkout')"
            class="flex items-center space-x-1.5 px-2 py-1 rounded-md hover:bg-secondary hover:text-foreground cursor-pointer truncate text-xs"
            :class="group.name ? 'pl-5' : ''"
          >
            <Globe class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 opacity-80 shrink-0" />
            <span class="truncate">{{ group.name ? branch.name.slice(group.name.length + 1) : branch.name }}</span>
          </div>
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
          <span>{{ t('Tags') }} ({{ repoStore.tags.length }})</span>
        </div>
        <button
          @click.stop="repoStore.isTagModalOpen = true"
          class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          :title="t('Create Tag')"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>

      <div v-if="isTagsOpen" class="mt-1 space-y-0.5 text-muted-foreground">
        <div
          v-for="tag in repoStore.tags"
          :key="tag.name"
          @click="handleLocateCommit(tag.target_commit_id)"
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
          <span>{{ t('Stashes') }} ({{ repoStore.stashes.length }})</span>
        </div>
        <button
          @click.stop="repoStore.isStashModalOpen = true"
          class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          :title="t('Save Stash')"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>

      <div v-if="isStashesOpen" class="mt-1 space-y-0.5 text-muted-foreground">
        <div
          v-for="stash in repoStore.stashes"
          :key="stash.index"
          @click="repoStore.isStashModalOpen = true"
          class="flex items-center justify-between px-2 py-1 rounded-md hover:bg-secondary hover:text-foreground cursor-pointer truncate group text-xs"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <Archive class="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 opacity-80 shrink-0" />
            <span class="truncate">{{ stash.message }}</span>
          </div>
          <span class="text-[10px] text-primary font-bold opacity-0 group-hover:opacity-100">{{ t('Manage') }}</span>
        </div>
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
