<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRepoStore } from '@/stores/repo';
import type { BranchItem } from '@/types/git';
import BranchContextMenu from '@/components/menus/BranchContextMenu.vue';
import RepositoryContextMenu from '@/components/menus/RepositoryContextMenu.vue';
import { useI18n } from '@/i18n';
import { useNotificationStore } from '@/stores/notification';
import { useConfirmationStore } from '@/stores/confirmation';
import { formatGitError } from '@/composables/useGitApi';
import { useBranchCheckout } from '@/composables/useBranchCheckout';
import {
  FolderGit2,
  FolderPlus,
  GitBranch,
  Globe,
  Tag,
  Archive,
  ChevronDown,
  ChevronRight,
  Plus,
  Check,
  Trash2,
  Edit3,
  MoreVertical,
  GitFork,
  FolderTree,
  Folder,
  FolderOpen,
  ArrowDownCircle,
  ArrowUpCircle,
} from 'lucide-vue-next';

const repoStore = useRepoStore();
const { t } = useI18n();
const notification = useNotificationStore();
const confirmation = useConfirmationStore();
const { checkoutBranch } = useBranchCheckout();

async function discoverRoots() {
  try { const count = await repoStore.discoverRoots(); notification.success(t('Git Roots Discovered'), t('Found {count} Git roots.', { count })); }
  catch (error: any) { notification.error(t('Discovery Failed'), error?.message || String(error)); }
}

async function handleSwitchRepo(path: string) {
  if (path === repoStore.activeRepoPath && repoStore.repoInfo) return;
  try {
    await repoStore.switchRepo(path);
    notification.info(t('Switched Repository'), t('Active workspace: {path}', { path }));
  } catch (error) {
    notification.error(t('Failed to switch repository'), formatGitError(error));
  }
}

const isReposOpen = ref(true);
const isBranchesOpen = ref(true);
const isRemotesOpen = ref(true);
const isTagsOpen = ref(true);
const isStashesOpen = ref(true);
const collapsedLocalBranchDirectories = ref(new Set<string>());
const collapsedRemoteBranchDirectories = ref(new Set<string>());

const COLLAPSED_REPO_GROUPS_KEY = 'gitbx_collapsed_repo_groups';
function readInitialCollapsedRepoGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_REPO_GROUPS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.filter((item) => typeof item === 'string'));
    }
  } catch {}
  return new Set<string>();
}
const collapsedRepoGroups = ref(readInitialCollapsedRepoGroups());
const draggingRepoPath = ref<string | null>(null);
const dragOverTarget = ref<string | null>(null);

const contextMenu = ref<{ branch: BranchItem; x: number; y: number } | null>(null);
const repositoryContextMenu = ref<{ path: string; x: number; y: number } | null>(null);
const groupContextMenu = ref<{ groupName: string; x: number; y: number } | null>(null);

const allRepoGroups = computed(() => {
  const groups = [...repoStore.repoGroups];
  const seen = new Set(groups);
  for (const repo of repoStore.repoList) {
    if (repo.group && !seen.has(repo.group)) {
      seen.add(repo.group);
      groups.push(repo.group);
    }
  }
  return groups;
});

const groupedRepositories = computed(() =>
  allRepoGroups.value.map((groupName) => ({
    name: groupName,
    repos: repoStore.repoList.filter((repo) => repo.group === groupName),
  }))
);

const ungroupedRepositories = computed(() =>
  repoStore.repoList.filter((repo) => !repo.group)
);

function persistCollapsedRepoGroups() {
  try {
    localStorage.setItem(COLLAPSED_REPO_GROUPS_KEY, JSON.stringify([...collapsedRepoGroups.value]));
  } catch {}
}

function toggleRepoGroup(groupName: string) {
  const next = new Set(collapsedRepoGroups.value);
  if (next.has(groupName)) next.delete(groupName);
  else next.add(groupName);
  collapsedRepoGroups.value = next;
  persistCollapsedRepoGroups();
}

function openAddRepoModal(groupName?: string) {
  groupContextMenu.value = null;
  repoStore.targetRepoGroupForAdd = groupName || '';
  repoStore.openModal('addRepo');
}

async function handleCreateGroup(assignRepoPath?: string) {
  groupContextMenu.value = null;
  const name = await confirmation.prompt({
    title: t('New Group'),
    message: t('Enter a name for the new repository group.'),
    inputLabel: t('Group Name'),
    confirmText: t('Create'),
  });
  const cleanName = name?.trim();
  if (!cleanName) return;
  const created = repoStore.createRepoGroup(cleanName);
  if (created) {
    if (assignRepoPath) {
      repoStore.setRepoGroup(assignRepoPath, created);
    }
    isReposOpen.value = true;
    const next = new Set(collapsedRepoGroups.value);
    next.delete(created);
    collapsedRepoGroups.value = next;
    persistCollapsedRepoGroups();
    notification.success(t('Group Created'), created);
  }
}

async function handleRenameGroup(groupName: string) {
  groupContextMenu.value = null;
  const nextName = await confirmation.prompt({
    title: t('Rename Group'),
    message: t("Enter a new name for group '{group}'.", { group: groupName }),
    inputLabel: t('Group Name'),
    defaultValue: groupName,
    confirmText: t('Rename'),
  });
  const cleanNext = nextName?.trim();
  if (!cleanNext || cleanNext === groupName) return;
  if (repoStore.renameRepoGroup(groupName, cleanNext)) {
    if (collapsedRepoGroups.value.has(groupName)) {
      const next = new Set(collapsedRepoGroups.value);
      next.delete(groupName);
      next.add(cleanNext);
      collapsedRepoGroups.value = next;
      persistCollapsedRepoGroups();
    }
    notification.success(t('Group Renamed'), cleanNext);
  }
}

async function handleDeleteGroup(groupName: string) {
  groupContextMenu.value = null;
  const confirmed = await confirmation.confirm({
    title: t('Delete Group'),
    message: t("Delete group '{group}'? Repositories in this group will not be removed and will become ungrouped.", { group: groupName }),
    danger: true,
    confirmText: t('Delete'),
  });
  if (!confirmed) return;
  repoStore.deleteRepoGroup(groupName);
  if (collapsedRepoGroups.value.has(groupName)) {
    const next = new Set(collapsedRepoGroups.value);
    next.delete(groupName);
    collapsedRepoGroups.value = next;
    persistCollapsedRepoGroups();
  }
  notification.info(t('Group Deleted'), groupName);
}

function handleRepoDragStart(event: DragEvent, repoPath: string) {
  draggingRepoPath.value = repoPath;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', repoPath);
  }
}

function handleRepoDragEnd() {
  draggingRepoPath.value = null;
  dragOverTarget.value = null;
}

function handleGroupDragOver(event: DragEvent, target: string) {
  if (!draggingRepoPath.value) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  dragOverTarget.value = target;
}

function handleGroupDragLeave(target: string) {
  if (dragOverTarget.value === target) {
    dragOverTarget.value = null;
  }
}

function handleGroupDrop(event: DragEvent, groupName: string | null) {
  event.preventDefault();
  const repoPath = draggingRepoPath.value || event.dataTransfer?.getData('text/plain');
  draggingRepoPath.value = null;
  dragOverTarget.value = null;
  if (!repoPath) return;
  repoStore.setRepoGroup(repoPath, groupName);
  if (groupName && collapsedRepoGroups.value.has(groupName)) {
    const next = new Set(collapsedRepoGroups.value);
    next.delete(groupName);
    collapsedRepoGroups.value = next;
    persistCollapsedRepoGroups();
  }
}

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
  void checkoutBranch(name);
}

function handleLocateCommit(commitId: string) {
  void repoStore.locateCommit(commitId);
}

function openContextMenu(e: MouseEvent, branch: BranchItem) {
  e.preventDefault();
  repositoryContextMenu.value = null;
  groupContextMenu.value = null;
  contextMenu.value = {
    branch,
    x: e.clientX,
    y: e.clientY,
  };
}

function openRepositoryContextMenu(e: MouseEvent, path: string) {
  e.preventDefault();
  contextMenu.value = null;
  groupContextMenu.value = null;
  repositoryContextMenu.value = { path, x: e.clientX, y: e.clientY };
}

function openGroupContextMenu(e: MouseEvent, groupName: string) {
  e.preventDefault();
  contextMenu.value = null;
  repositoryContextMenu.value = null;
  groupContextMenu.value = {
    groupName,
    x: Math.max(8, Math.min(e.clientX, window.innerWidth - 200)),
    y: Math.max(8, Math.min(e.clientY, window.innerHeight - 140)),
  };
}
</script>

<template>
  <aside class="dbx-sidebar w-full h-full max-h-full min-h-0 self-stretch bg-muted/30 dark:bg-card flex flex-col select-none overflow-hidden text-xs">
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
            @click.stop="handleCreateGroup()"
            data-testid="sidebar-new-repo-group-btn"
            class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            :title="t('New Group')"
          >
            <FolderPlus class="w-3.5 h-3.5" />
          </button>
          <button
            @click.stop="repoStore.openModal('remote')"
            :disabled="!repoStore.activeRepoPath"
            class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            :title="t('View and edit Git remotes')"
          >
            <GitFork class="w-3.5 h-3.5" />
          </button>
          <button
            @click.stop="openAddRepoModal()"
            class="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            :title="t('Add Repository')"
          >
            <Plus class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div v-if="isReposOpen" class="space-y-0.5" @click="groupContextMenu = null">
        <!-- Repository Groups -->
        <div
          v-for="group in groupedRepositories"
          :key="`repo-group:${group.name}`"
          class="space-y-0.5 rounded-md transition"
          :class="dragOverTarget === `group:${group.name}` ? 'bg-primary/10 ring-1 ring-primary/40' : ''"
          @dragover="handleGroupDragOver($event, `group:${group.name}`)"
          @dragleave="handleGroupDragLeave(`group:${group.name}`)"
          @drop="handleGroupDrop($event, group.name)"
        >
          <div
            class="branch-directory-row group/repogroup justify-between pr-1"
            @click.stop="toggleRepoGroup(group.name)"
            @contextmenu.prevent.stop="openGroupContextMenu($event, group.name)"
          >
            <div class="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              <component :is="collapsedRepoGroups.has(group.name) ? ChevronRight : ChevronDown" class="w-3 h-3 shrink-0" />
              <component :is="collapsedRepoGroups.has(group.name) ? Folder : FolderOpen" class="w-3.5 h-3.5 shrink-0 text-amber-500/90" />
              <span class="truncate text-[11px] font-semibold text-foreground/90">{{ group.name }}</span>
              <span class="shrink-0 text-[10px] text-muted-foreground">({{ group.repos.length }})</span>
            </div>
            <div class="flex shrink-0 items-center gap-0.5 opacity-0 group-hover/repogroup:opacity-100 focus-within:opacity-100 transition">
              <button
                @click.stop="openAddRepoModal(group.name)"
                class="p-0.5 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground"
                :title="t('Add Repository to Group')"
              >
                <Plus class="w-3 h-3" />
              </button>
              <button
                @click.stop="handleRenameGroup(group.name)"
                class="p-0.5 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground"
                :title="t('Rename Group')"
              >
                <Edit3 class="w-3 h-3" />
              </button>
              <button
                @click.stop="handleDeleteGroup(group.name)"
                class="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-rose-600"
                :title="t('Delete Group')"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <div v-if="!collapsedRepoGroups.has(group.name)" class="ml-2.5 pl-1.5 border-l border-border/60 space-y-0.5">
            <div
              v-if="group.repos.length === 0"
              class="px-2 py-1 text-[10px] text-muted-foreground/70 italic select-none"
            >
              {{ t('No repositories in group') }}
            </div>
            <div
              v-for="repo in group.repos"
              :key="repo.path"
              draggable="true"
              @dragstart="handleRepoDragStart($event, repo.path)"
              @dragend="handleRepoDragEnd"
              @click.stop="handleSwitchRepo(repo.path)"
              @contextmenu.prevent.stop="openRepositoryContextMenu($event, repo.path)"
              @keydown.enter.prevent="handleSwitchRepo(repo.path)"
              @keydown.space.prevent="handleSwitchRepo(repo.path)"
              role="button"
              tabindex="0"
              class="flex min-w-0 items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition text-xs group"
              :class="repoStore.activeRepoPath === repo.path ? 'bg-primary/10 text-primary font-bold border border-primary/30 shadow-xs' : 'text-foreground hover:bg-secondary'"
            >
              <div class="flex min-w-0 flex-1 items-center space-x-1.5 overflow-hidden">
                <FolderGit2 class="w-3.5 h-3.5 shrink-0" :class="repoStore.activeRepoPath === repo.path ? 'text-primary' : 'text-muted-foreground'" />
                <span class="min-w-0 truncate">{{ repo.name }}</span>
              </div>

              <div class="ml-1 flex shrink-0 items-center gap-1">
                <span
                  v-if="repoStore.repoSyncStatuses[repo.path]?.incoming.length"
                  class="flex items-center gap-0.5 font-semibold text-rose-600 dark:text-rose-400"
                  :title="`${t('Incoming')} (${repoStore.repoSyncStatuses[repo.path].incoming.length})`"
                >
                  <ArrowDownCircle class="h-3.5 w-3.5" />
                  <span>{{ repoStore.repoSyncStatuses[repo.path].incoming.length }}</span>
                </span>
                <span
                  v-if="repoStore.repoSyncStatuses[repo.path]?.outgoing.length"
                  class="flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400"
                  :title="`${t('Outgoing')} (${repoStore.repoSyncStatuses[repo.path].outgoing.length})`"
                >
                  <ArrowUpCircle class="h-3.5 w-3.5" />
                  <span>{{ repoStore.repoSyncStatuses[repo.path].outgoing.length }}</span>
                </span>
                <button
                  v-if="repoStore.repoList.length > 1"
                  @click.stop="repoStore.removeRepo(repo.path)"
                  class="shrink-0 p-0.5 rounded hover:bg-destructive/20 hover:text-rose-600 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                  :title="t('Remove from Workspace')"
                >
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Ungrouped Repositories -->
        <div
          class="space-y-0.5 rounded-md transition"
          :class="dragOverTarget === '__ungrouped__' ? 'bg-primary/10 ring-1 ring-primary/40 p-0.5' : ''"
          @dragover="handleGroupDragOver($event, '__ungrouped__')"
          @dragleave="handleGroupDragLeave('__ungrouped__')"
          @drop="handleGroupDrop($event, null)"
        >
          <div
            v-if="draggingRepoPath && ungroupedRepositories.length === 0"
            class="px-2 py-1 text-[10px] text-muted-foreground italic text-center border border-dashed border-border rounded"
          >
            {{ t('Drop here to ungroup') }}
          </div>
          <div
            v-for="repo in ungroupedRepositories"
            :key="repo.path"
            draggable="true"
            @dragstart="handleRepoDragStart($event, repo.path)"
            @dragend="handleRepoDragEnd"
            @click.stop="handleSwitchRepo(repo.path)"
            @contextmenu.prevent.stop="openRepositoryContextMenu($event, repo.path)"
            @keydown.enter.prevent="handleSwitchRepo(repo.path)"
            @keydown.space.prevent="handleSwitchRepo(repo.path)"
            role="button"
            tabindex="0"
            class="flex min-w-0 items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition text-xs group"
            :class="repoStore.activeRepoPath === repo.path ? 'bg-primary/10 text-primary font-bold border border-primary/30 shadow-xs' : 'text-foreground hover:bg-secondary'"
          >
            <div class="flex min-w-0 flex-1 items-center space-x-1.5 overflow-hidden">
              <FolderGit2 class="w-3.5 h-3.5 shrink-0" :class="repoStore.activeRepoPath === repo.path ? 'text-primary' : 'text-muted-foreground'" />
              <span class="min-w-0 truncate">{{ repo.name }}</span>
            </div>

            <div class="ml-1 flex shrink-0 items-center gap-1">
              <span
                v-if="repoStore.repoSyncStatuses[repo.path]?.incoming.length"
                class="flex items-center gap-0.5 font-semibold text-rose-600 dark:text-rose-400"
                :title="`${t('Incoming')} (${repoStore.repoSyncStatuses[repo.path].incoming.length})`"
              >
                <ArrowDownCircle class="h-3.5 w-3.5" />
                <span>{{ repoStore.repoSyncStatuses[repo.path].incoming.length }}</span>
              </span>
              <span
                v-if="repoStore.repoSyncStatuses[repo.path]?.outgoing.length"
                class="flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400"
                :title="`${t('Outgoing')} (${repoStore.repoSyncStatuses[repo.path].outgoing.length})`"
              >
                <ArrowUpCircle class="h-3.5 w-3.5" />
                <span>{{ repoStore.repoSyncStatuses[repo.path].outgoing.length }}</span>
              </span>
              <button
                v-if="repoStore.repoList.length > 1"
                @click.stop="repoStore.removeRepo(repo.path)"
                class="shrink-0 p-0.5 rounded hover:bg-destructive/20 hover:text-rose-600 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                :title="t('Remove from Workspace')"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>
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
          @click.stop="repoStore.openModal('branch')"
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
              <span
                v-if="row.branch.behind_count"
                class="flex items-center gap-0.5 font-semibold text-rose-600 dark:text-rose-400"
                :title="`${t('Incoming')} (${row.branch.behind_count})`"
              >
                <ArrowDownCircle class="h-3.5 w-3.5" />
                <span>{{ row.branch.behind_count }}</span>
              </span>
              <span
                v-if="row.branch.ahead_count"
                class="flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400"
                :title="`${t('Outgoing')} (${row.branch.ahead_count})`"
              >
                <ArrowUpCircle class="h-3.5 w-3.5" />
                <span>{{ row.branch.ahead_count }}</span>
              </span>
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

    <!-- Worktrees Section -->
    <div class="p-2 border-b border-border">
      <button
        class="w-full flex items-center justify-between rounded-md px-1.5 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition"
        :title="t('Manage Worktrees')"
        @click="repoStore.openModal('worktreeManager')"
      >
        <span class="flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase">
          <FolderGit2 class="w-3.5 h-3.5 text-teal-500" />
          {{ t('Worktrees') }}
        </span>
        <span class="text-[10px]">{{ t('Manage') }}</span>
      </button>
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
          @click.stop="repoStore.openModal('tag')"
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
          @click.stop="repoStore.openModal('stash')"
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
          @click="repoStore.openModal('stash')"
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
    <RepositoryContextMenu
      v-if="repositoryContextMenu"
      :path="repositoryContextMenu.path"
      :x="repositoryContextMenu.x"
      :y="repositoryContextMenu.y"
      @close="repositoryContextMenu = null"
    />
    <Teleport to="body">
      <div
        v-if="groupContextMenu"
        class="fixed inset-0 z-50"
        @click="groupContextMenu = null"
        @contextmenu.prevent="groupContextMenu = null"
      >
        <div
          class="fixed w-48 rounded-lg border border-border bg-popover py-1 text-xs text-foreground shadow-2xl select-none divide-y divide-border/60"
          :style="{ left: `${groupContextMenu.x}px`, top: `${groupContextMenu.y}px` }"
          role="menu"
          @click.stop
        >
          <div class="py-1">
            <button
              role="menuitem"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary"
              @click="openAddRepoModal(groupContextMenu.groupName)"
            >
              <Plus class="h-3.5 w-3.5 text-primary" />
              <span>{{ t('Add Repository to Group') }}</span>
            </button>
            <button
              role="menuitem"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary"
              @click="handleRenameGroup(groupContextMenu.groupName)"
            >
              <Edit3 class="h-3.5 w-3.5 text-muted-foreground" />
              <span>{{ t('Rename Group') }}</span>
            </button>
          </div>
          <div class="py-1">
            <button
              role="menuitem"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-destructive/20"
              @click="handleDeleteGroup(groupContextMenu.groupName)"
            >
              <Trash2 class="h-3.5 w-3.5" />
              <span>{{ t('Delete Group') }}</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
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
