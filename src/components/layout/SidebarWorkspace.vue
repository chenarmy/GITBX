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
  Folder,
  FolderOpen,
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
const collapsedLocalBranchDirectories = ref(new Set<string>());
const collapsedRemoteBranchDirectories = ref(new Set<string>());

const contextMenu = ref<{ branch: BranchItem; x: number; y: number } | null>(null);

interface BranchTreeNode {
  name: string;
  path: string;
  children: BranchTreeNode[];
  branches: BranchItem[];
}

type BranchTreeRow =
  | { type: 'directory'; depth: number; node: BranchTreeNode }
  | { type: 'branch'; depth: number; branch: BranchItem };

function buildBranchTree(branches: BranchItem[]): BranchTreeNode {
  type MutableBranchTreeNode = Omit<BranchTreeNode, 'children'> & { childMap: Map<string, MutableBranchTreeNode> };
  const root: MutableBranchTreeNode = { name: '', path: '', childMap: new Map(), branches: [] };

  for (const branch of branches) {
    const parts = branch.name.split('/').filter(Boolean);
    let current = root;
    for (const part of parts.slice(0, -1)) {
      const path = current.path ? `${current.path}/${part}` : part;
      let child = current.childMap.get(part);
      if (!child) {
        child = { name: part, path, childMap: new Map(), branches: [] };
        current.childMap.set(part, child);
      }
      current = child;
    }
    current.branches.push(branch);
  }

  const finalize = (node: MutableBranchTreeNode): BranchTreeNode => ({
    name: node.name,
    path: node.path,
    children: [...node.childMap.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(finalize),
    branches: [...node.branches].sort((a, b) => a.name.localeCompare(b.name)),
  });
  return finalize(root);
}

function flattenBranchTree(root: BranchTreeNode, collapsed: Set<string>): BranchTreeRow[] {
  const rows: BranchTreeRow[] = [];
  const visit = (node: BranchTreeNode, depth: number) => {
    for (const child of node.children) {
      rows.push({ type: 'directory', depth, node: child });
      if (!collapsed.has(child.path)) visit(child, depth + 1);
    }
    for (const branch of node.branches) rows.push({ type: 'branch', depth, branch });
  };
  visit(root, 0);
  return rows;
}

const localBranches = computed(() => repoStore.branches.filter((branch) => !branch.is_remote));
const remoteBranches = computed(() => repoStore.branches.filter(
  (branch) => branch.is_remote && !branch.name.endsWith('/HEAD') && branch.name !== 'HEAD'
));
const localBranchRows = computed(() => flattenBranchTree(buildBranchTree(localBranches.value), collapsedLocalBranchDirectories.value));
const remoteBranchRows = computed(() => flattenBranchTree(buildBranchTree(remoteBranches.value), collapsedRemoteBranchDirectories.value));

function toggleBranchDirectory(kind: 'local' | 'remote', path: string) {
  const source = kind === 'local' ? collapsedLocalBranchDirectories : collapsedRemoteBranchDirectories;
  const next = new Set(source.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  source.value = next;
}

function branchLeafName(branchName: string) {
  return branchName.split('/').pop() || branchName;
}

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
          <span>{{ t('Local Branches') }} ({{ localBranches.length }})</span>
        </div>
        <button
          @click.stop="repoStore.isBranchModalOpen = true"
          class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          :title="t('Create Branch')"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>

      <div v-if="isBranchesOpen" class="mt-1 space-y-0.5">
        <template v-for="row in localBranchRows" :key="row.type === 'directory' ? `local-directory:${row.node.path}` : `local-branch:${row.branch.name}`">
          <div
            v-if="row.type === 'directory'"
            class="branch-directory-row"
            :style="{ paddingLeft: `${0.35 + row.depth * 0.8}rem` }"
            @click="toggleBranchDirectory('local', row.node.path)"
          >
            <component :is="collapsedLocalBranchDirectories.has(row.node.path) ? ChevronRight : ChevronDown" class="w-3 h-3 shrink-0" />
            <component :is="collapsedLocalBranchDirectories.has(row.node.path) ? Folder : FolderOpen" class="w-3.5 h-3.5 shrink-0 text-amber-500/90" />
            <span class="truncate">{{ row.node.name }}</span>
          </div>
          <div
            v-else
            @dblclick="handleCheckout(row.branch.name)"
            @click="handleLocateCommit(row.branch.target_commit_id)"
            @contextmenu.prevent="openContextMenu($event, row.branch)"
            :title="t('Click to locate in log; double-click to checkout')"
            class="flex min-w-0 items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition text-xs group"
            :class="row.branch.is_head ? 'bg-primary/10 text-primary font-bold border-l-2 border-primary shadow-xs' : 'text-foreground hover:bg-secondary'"
            :style="{ paddingLeft: `${0.5 + row.depth * 0.8}rem` }"
          >
            <div class="flex min-w-0 flex-1 items-center space-x-1.5 overflow-hidden">
              <GitBranch class="w-3.5 h-3.5 shrink-0" :class="row.branch.is_head ? 'text-primary' : 'text-muted-foreground'" />
              <span class="min-w-0 truncate">{{ branchLeafName(row.branch.name) }}</span>
            </div>

            <div class="ml-1 flex shrink-0 items-center space-x-1">
              <Check v-if="row.branch.is_head" class="w-3.5 h-3.5 text-primary shrink-0 font-bold" />
              <button
                @click.stop="openContextMenu($event, row.branch)"
                class="shrink-0 p-0.5 rounded hover:bg-secondary text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                :title="t('More actions')"
              >
                <MoreVertical class="w-3 h-3" />
              </button>
            </div>
          </div>
        </template>
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
          <span>{{ t('Remote Branches') }} ({{ remoteBranches.length }})</span>
        </div>
      </div>

      <div v-if="isRemotesOpen" class="mt-1 space-y-0.5 text-muted-foreground">
        <template v-for="row in remoteBranchRows" :key="row.type === 'directory' ? `remote-directory:${row.node.path}` : `remote-branch:${row.branch.name}`">
          <div
            v-if="row.type === 'directory'"
            class="branch-directory-row"
            :style="{ paddingLeft: `${0.35 + row.depth * 0.8}rem` }"
            @click="toggleBranchDirectory('remote', row.node.path)"
          >
            <component :is="collapsedRemoteBranchDirectories.has(row.node.path) ? ChevronRight : ChevronDown" class="w-3 h-3 shrink-0" />
            <component :is="collapsedRemoteBranchDirectories.has(row.node.path) ? Folder : FolderOpen" class="w-3.5 h-3.5 shrink-0 text-amber-500/90" />
            <span class="truncate">{{ row.node.name }}</span>
          </div>
          <div
            v-else
            @dblclick="handleCheckout(row.branch.name)"
            @click="handleLocateCommit(row.branch.target_commit_id)"
            @contextmenu.prevent="openContextMenu($event, row.branch)"
            :title="t('Click to locate in log; double-click to checkout')"
            class="flex items-center space-x-1.5 px-2 py-1 rounded-md hover:bg-secondary hover:text-foreground cursor-pointer truncate text-xs"
            :style="{ paddingLeft: `${0.5 + row.depth * 0.8}rem` }"
          >
            <Globe class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 opacity-80 shrink-0" />
            <span class="truncate">{{ branchLeafName(row.branch.name) }}</span>
          </div>
        </template>
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

<style scoped>
.branch-directory-row {
  align-items: center;
  border-radius: 0.375rem;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  display: flex;
  font-size: 10px;
  font-weight: 600;
  gap: 0.25rem;
  min-width: 0;
  padding-bottom: 0.25rem;
  padding-right: 0.5rem;
  padding-top: 0.25rem;
}
.branch-directory-row:hover {
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
}
</style>
