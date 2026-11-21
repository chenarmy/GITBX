<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import type { BranchItem } from '@/types/git';
import BranchContextMenu from '@/components/menus/BranchContextMenu.vue';
import RepositoryContextMenu from '@/components/menus/RepositoryContextMenu.vue';
import { useI18n } from '@/i18n';
import { useNotificationStore } from '@/stores/notification';
import { useConfirmationStore } from '@/stores/confirmation';
import { formatGitError } from '@/composables/useGitApi';
import { useBranchCheckout } from '@/composables/useBranchCheckout';
import { useContextMenuPosition } from '@/composables/useContextMenuPosition';
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
  RefreshCw,
  Search,
  X,
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
const tagFilterQuery = ref('');
const visibleTagLimit = ref(50);
const isSyncingTags = ref(false);
const isStashesOpen = ref(true);

const filteredTags = computed(() => {
  const query = tagFilterQuery.value.trim().toLowerCase();
  if (!query) return repoStore.tags;
  return repoStore.tags.filter((tag) => tag.name.toLowerCase().includes(query));
});

const visibleTags = computed(() => filteredTags.value.slice(0, visibleTagLimit.value));

watch(tagFilterQuery, () => {
  visibleTagLimit.value = 50;
});
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
const draggingGroupName = ref<string | null>(null);
const dragOverTarget = ref<string | null>(null);
const repoDropIndicator = ref<{ path: string; position: 'before' | 'after' } | null>(null);
const groupDropIndicator = ref<{ name: string; position: 'before' | 'after' } | null>(null);

const contextMenu = ref<{ branch: BranchItem; x: number; y: number } | null>(null);
const repositoryContextMenu = ref<{ path: string; x: number; y: number } | null>(null);
const groupContextMenu = ref<{ groupName: string; x: number; y: number } | null>(null);
const workspaceContextMenu = ref<{ x: number; y: number } | null>(null);
const groupMenuRef = ref<HTMLElement | null>(null);
const workspaceMenuRef = ref<HTMLElement | null>(null);
const { menuStyle: groupContextMenuStyle } = useContextMenuPosition(
  groupMenuRef,
  () => groupContextMenu.value,
  { fallbackWidth: 208, fallbackHeight: 240 },
);
const { menuStyle: workspaceContextMenuStyle } = useContextMenuPosition(
  workspaceMenuRef,
  () => (workspaceContextMenu.value && !groupContextMenu.value ? workspaceContextMenu.value : null),
  { fallbackWidth: 240, fallbackHeight: 160 },
);
const isBulkOperating = ref(false);

function openWorkspaceContextMenu(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  contextMenu.value = null;
  repositoryContextMenu.value = null;
  groupContextMenu.value = null;
  workspaceContextMenu.value = {
    x: e.clientX,
    y: e.clientY,
  };
}

function formatBulkResult(action: string, result: { succeeded: string[]; failed: Array<{ path: string; error: string }> }) {
  const total = result.succeeded.length + result.failed.length;
  if (result.failed.length === 0) {
    notification.success(t('{action} All Completed', { action }), t('{succeeded}/{total} repositories succeeded.', { succeeded: result.succeeded.length, total }));
  } else if (result.succeeded.length === 0) {
    notification.error(t('{action} All Failed', { action }), result.failed.slice(0, 3).map((f) => `${f.path}: ${f.error}`).join('\n') || t('All repositories failed.'));
  } else {
    notification.warning(
      t('{action} All Partially Completed', { action }),
      t('{succeeded}/{total} succeeded. Failed: {failed}', { succeeded: result.succeeded.length, total, failed: result.failed.map((f) => f.path.split(/[\\/]/).pop() || f.path).join(', ') })
    );
  }
}

async function handleFetchAllRepos() {
  if (isBulkOperating.value) return;
  workspaceContextMenu.value = null;
  groupContextMenu.value = null;
  isBulkOperating.value = true;
  notification.info(t('Git Fetch'), t('Fetching all repositories ({count})...', { count: repoStore.repoList.length }));
  try {
    const result = await repoStore.fetchAllRepos();
    formatBulkResult(t('Fetch'), result);
  } catch (error) {
    notification.error(t('Fetch Failed'), formatGitError(error));
  } finally {
    isBulkOperating.value = false;
  }
}

async function handlePullAllRepos() {
  if (isBulkOperating.value) return;
  workspaceContextMenu.value = null;
  groupContextMenu.value = null;
  isBulkOperating.value = true;
  const strategy = (localStorage.getItem('gitbx_pull_strategy') as 'merge' | 'rebase' | 'ff-only') || 'merge';
  notification.info(t('Git Pull'), t('Pulling all repositories ({count})...', { count: repoStore.repoList.length }));
  try {
    const result = await repoStore.pullAllRepos(strategy);
    formatBulkResult(t('Pull'), result);
  } catch (error) {
    notification.error(t('Pull Failed'), formatGitError(error));
  } finally {
    isBulkOperating.value = false;
  }
}

async function handlePushAllRepos() {
  if (isBulkOperating.value) return;
  workspaceContextMenu.value = null;
  groupContextMenu.value = null;
  isBulkOperating.value = true;
  notification.info(t('Git Push'), t('Pushing all repositories ({count})...', { count: repoStore.repoList.length }));
  try {
    const result = await repoStore.pushAllRepos(false);
    formatBulkResult(t('Push'), result);
  } catch (error) {
    notification.error(t('Push Failed'), formatGitError(error));
  } finally {
    isBulkOperating.value = false;
  }
}

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

function getVerticalDropPosition(event: DragEvent): 'before' | 'after' {
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return 'after';
  const rect = target.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function isLeavingElement(event: DragEvent): boolean {
  const currentTarget = event.currentTarget as HTMLElement | null;
  const relatedTarget = event.relatedTarget as Node | null;
  return Boolean(currentTarget && relatedTarget && currentTarget.contains(relatedTarget));
}

function resetDragState() {
  draggingRepoPath.value = null;
  draggingGroupName.value = null;
  dragOverTarget.value = null;
  repoDropIndicator.value = null;
  groupDropIndicator.value = null;
}

function handleRepoDragStart(event: DragEvent, repoPath: string) {
  draggingGroupName.value = null;
  groupDropIndicator.value = null;
  draggingRepoPath.value = repoPath;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', repoPath);
    event.dataTransfer.setData('application/x-gitbx-repo', repoPath);
  }
}

function hasDragType(event: DragEvent, type: string): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).some((item) => item.toLowerCase() === type);
}

function isRepositoryDrag(event: DragEvent): boolean {
  if (isGroupDrag(event)) return false;
  return Boolean(
    draggingRepoPath.value ||
    hasDragType(event, 'application/x-gitbx-repo') ||
    hasDragType(event, 'text/plain')
  );
}

function isGroupDrag(event: DragEvent): boolean {
  return Boolean(
    draggingGroupName.value ||
    hasDragType(event, 'application/x-gitbx-group')
  );
}

function handleDragEnter(event: DragEvent) {
  if (!isRepositoryDrag(event) && !isGroupDrag(event)) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function handleRepoDragOver(event: DragEvent, targetRepoPath: string) {
  if (!isRepositoryDrag(event)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  dragOverTarget.value = null;
  if (draggingRepoPath.value === targetRepoPath) {
    repoDropIndicator.value = null;
    return;
  }
  repoDropIndicator.value = {
    path: targetRepoPath,
    position: getVerticalDropPosition(event),
  };
}

function handleRepoDragLeave(event: DragEvent, targetRepoPath: string) {
  if (isLeavingElement(event)) return;
  if (repoDropIndicator.value?.path === targetRepoPath) {
    repoDropIndicator.value = null;
  }
}

function handleRepoDrop(event: DragEvent, targetRepoPath: string) {
  if (isGroupDrag(event)) return;
  const sourcePath =
    draggingRepoPath.value ||
    event.dataTransfer?.getData('application/x-gitbx-repo') ||
    event.dataTransfer?.getData('text/plain');
  if (!sourcePath) return;
  event.preventDefault();
  event.stopPropagation();
  const position =
    repoDropIndicator.value?.path === targetRepoPath
      ? repoDropIndicator.value.position
      : getVerticalDropPosition(event);
  resetDragState();
  if (sourcePath !== targetRepoPath) {
    repoStore.reorderRepo(sourcePath, targetRepoPath, position);
  }
}

function handleGroupDragStart(event: DragEvent, groupName: string) {
  draggingRepoPath.value = null;
  repoDropIndicator.value = null;
  draggingGroupName.value = groupName;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-gitbx-group', groupName);
    event.dataTransfer.setData('text/plain', groupName);
  }
}

function handleGroupDragOver(event: DragEvent, target: string, groupName?: string) {
  if (isGroupDrag(event) && groupName) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    dragOverTarget.value = null;
    repoDropIndicator.value = null;
    if (draggingGroupName.value === groupName) {
      groupDropIndicator.value = null;
      return;
    }
    groupDropIndicator.value = {
      name: groupName,
      position: getVerticalDropPosition(event),
    };
    return;
  }
  if (!isRepositoryDrag(event)) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  repoDropIndicator.value = null;
  dragOverTarget.value = target;
}

function handleGroupDragLeave(event: DragEvent, target: string, groupName?: string) {
  if (isLeavingElement(event)) return;
  if (dragOverTarget.value === target) {
    dragOverTarget.value = null;
  }
  if (groupName && groupDropIndicator.value?.name === groupName) {
    groupDropIndicator.value = null;
  }
}

function handleGroupDrop(event: DragEvent, groupName: string | null) {
  const sourceGroup = draggingGroupName.value || event.dataTransfer?.getData('application/x-gitbx-group');
  if (sourceGroup) {
    event.preventDefault();
    if (groupName) {
      const position =
        groupDropIndicator.value?.name === groupName
          ? groupDropIndicator.value.position
          : getVerticalDropPosition(event);
      resetDragState();
      if (sourceGroup !== groupName) {
        repoStore.reorderRepoGroup(sourceGroup, groupName, position);
      }
    } else {
      resetDragState();
    }
    return;
  }

  event.preventDefault();
  const repoPath =
    draggingRepoPath.value ||
    event.dataTransfer?.getData('application/x-gitbx-repo') ||
    event.dataTransfer?.getData('text/plain');
  resetDragState();
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
  workspaceContextMenu.value = null;
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
  workspaceContextMenu.value = null;
  repositoryContextMenu.value = { path, x: e.clientX, y: e.clientY };
}

function openGroupContextMenu(e: MouseEvent, groupName: string) {
  e.preventDefault();
  contextMenu.value = null;
  repositoryContextMenu.value = null;
  workspaceContextMenu.value = null;
  groupContextMenu.value = {
    groupName,
    x: e.clientX,
    y: e.clientY,
  };
}

async function handleSyncTags() {
  if (isSyncingTags.value || !repoStore.remotes.length) return;
  isSyncingTags.value = true;
  try {
    await repoStore.syncTags();
    notification.success(t('Tags Synchronized'), t('Synchronized tags with remote.'));
  } catch (error) {
    notification.error(t('Tag Sync Failed'), formatGitError(error));
  } finally {
    isSyncingTags.value = false;
  }
}

async function handlePushAllTags() {
  if (!repoStore.tags.length || !repoStore.remotes.length) return;
  try {
    await repoStore.pushAllTags();
    notification.success(t('Tags Pushed'), t('Pushed all tags to remote.'));
  } catch (error) {
    notification.error(t('Push Tag Failed'), formatGitError(error));
  }
}

async function handlePushTag(name: string) {
  if (!repoStore.remotes.length) return;
  try {
    await repoStore.pushTag(name);
    notification.success(t('Tag Pushed'), t("Pushed tag '{name}' to remote.", { name }));
  } catch (error) {
    notification.error(t('Push Tag Failed'), formatGitError(error));
  }
}

async function handleDeleteTag(name: string) {
  const confirmed = await confirmation.confirm({
    title: t('Delete Tag'),
    message: t("Delete local tag '{name}'?", { name }),
    confirmText: t('Delete'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await repoStore.deleteTag(name, false);
    notification.success(t('Tag Deleted'), name);
  } catch (error) {
    notification.error(t('Delete Tag Failed'), formatGitError(error));
  }
}
</script>

<template>
  <aside class="dbx-sidebar w-full h-full max-h-full min-h-0 self-stretch flex flex-col select-none overflow-hidden text-xs">
    <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain divide-y divide-border/70">
    <!-- Repositories Section -->
    <div class="p-2">
      <div
        @click="isReposOpen = !isReposOpen"
        @contextmenu.prevent.stop="openWorkspaceContextMenu($event)"
        class="dbx-section-heading flex items-center justify-between px-1.5 py-1 mb-1 rounded-[4px] cursor-pointer hover:text-foreground transition-colors"
      >
        <div class="flex items-center gap-1 min-w-0">
          <button @click.stop="discoverRoots" :disabled="!repoStore.activeRepoPath" class="p-0.5 rounded-[4px] hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors" :title="t('Discover Nested Git Roots')"><FolderTree class="w-3.5 h-3.5" /></button>
          <component :is="isReposOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
          <span class="truncate">{{ t('Repositories') }}</span>
          <span class="ml-0.5 px-1.5 py-0 rounded-full bg-secondary text-[10px] font-medium tabular-nums text-muted-foreground">{{ repoStore.repoList.length }}</span>
        </div>
        <div class="flex items-center gap-0.5 shrink-0">
          <button
            @click.stop="handleCreateGroup()"
            data-testid="sidebar-new-repo-group-btn"
            class="p-1 rounded-[4px] hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            :title="t('New Group')"
          >
            <FolderPlus class="w-3.5 h-3.5" />
          </button>
          <button
            @click.stop="repoStore.openModal('remote')"
            :disabled="!repoStore.activeRepoPath"
            class="p-1 rounded-[4px] hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            :title="t('View and edit Git remotes')"
          >
            <GitFork class="w-3.5 h-3.5" />
          </button>
          <button
            @click.stop="openAddRepoModal()"
            class="p-1 rounded-[4px] hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
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
          class="relative space-y-0.5 rounded-[6px] transition-colors"
          :class="[
            dragOverTarget === `group:${group.name}` ? 'bg-primary/10 ring-1 ring-primary/40' : '',
            draggingGroupName === group.name ? 'opacity-50' : '',
          ]"
          @dragenter="handleDragEnter"
          @dragover="handleGroupDragOver($event, `group:${group.name}`, group.name)"
          @dragleave="handleGroupDragLeave($event, `group:${group.name}`, group.name)"
          @drop="handleGroupDrop($event, group.name)"
        >
          <div
            v-if="groupDropIndicator?.name === group.name"
            class="pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-primary z-10"
            :class="groupDropIndicator.position === 'before' ? 'top-0' : 'bottom-0'"
          />
          <div
            draggable="true"
            @dragstart.stop="handleGroupDragStart($event, group.name)"
            @dragend="resetDragState"
            class="branch-directory-row group/repogroup justify-between pr-1"
            @click.stop="toggleRepoGroup(group.name)"
            @contextmenu.prevent.stop="openGroupContextMenu($event, group.name)"
          >
            <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              <component :is="collapsedRepoGroups.has(group.name) ? ChevronRight : ChevronDown" class="w-3 h-3 shrink-0" />
              <component :is="collapsedRepoGroups.has(group.name) ? Folder : FolderOpen" class="w-3.5 h-3.5 shrink-0 text-amber-500" />
              <span class="truncate text-[11px] font-semibold text-foreground/90">{{ group.name }}</span>
              <span class="shrink-0 text-[10px] text-muted-foreground tabular-nums">({{ group.repos.length }})</span>
            </div>
            <div class="flex shrink-0 items-center gap-0.5 opacity-0 group-hover/repogroup:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                @click.stop="openAddRepoModal(group.name)"
                class="p-0.5 rounded-[4px] hover:bg-accent text-muted-foreground hover:text-foreground"
                :title="t('Add Repository to Group')"
              >
                <Plus class="w-3 h-3" />
              </button>
              <button
                @click.stop="handleRenameGroup(group.name)"
                class="p-0.5 rounded-[4px] hover:bg-accent text-muted-foreground hover:text-foreground"
                :title="t('Rename Group')"
              >
                <Edit3 class="w-3 h-3" />
              </button>
              <button
                @click.stop="handleDeleteGroup(group.name)"
                class="p-0.5 rounded-[4px] hover:bg-destructive/15 text-muted-foreground hover:text-destructive"
                :title="t('Delete Group')"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <div v-if="!collapsedRepoGroups.has(group.name)" class="ml-2.5 pl-1.5 border-l border-border/70 space-y-0.5">
            <div
              v-if="group.repos.length === 0"
              class="px-2 py-1 text-[10px] text-muted-foreground/75 italic select-none"
            >
              {{ t('No repositories in group') }}
            </div>
            <div
              v-for="repo in group.repos"
              :key="repo.path"
              draggable="true"
              @dragstart.stop="handleRepoDragStart($event, repo.path)"
              @dragenter.stop="handleDragEnter"
              @dragover="handleRepoDragOver($event, repo.path)"
              @dragleave="handleRepoDragLeave($event, repo.path)"
              @drop="handleRepoDrop($event, repo.path)"
              @dragend="resetDragState"
              @click.stop="handleSwitchRepo(repo.path)"
              @contextmenu.prevent.stop="openRepositoryContextMenu($event, repo.path)"
              @keydown.enter.prevent="handleSwitchRepo(repo.path)"
              @keydown.space.prevent="handleSwitchRepo(repo.path)"
              role="button"
              tabindex="0"
              class="relative flex min-w-0 items-center justify-between px-2 py-1.5 rounded-[4px] cursor-pointer transition-colors text-xs group"
              :class="[
                repoStore.activeRepoPath === repo.path ? 'bg-primary/10 text-primary font-semibold border border-primary/25' : 'text-foreground hover:bg-accent/70',
                draggingRepoPath === repo.path ? 'opacity-50' : '',
              ]"
            >
              <div
                v-if="repoDropIndicator?.path === repo.path"
                class="pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-primary z-10"
                :class="repoDropIndicator.position === 'before' ? 'top-0' : 'bottom-0'"
              />
              <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                <FolderGit2 class="w-3.5 h-3.5 shrink-0" :class="repoStore.activeRepoPath === repo.path ? 'text-primary' : 'text-muted-foreground'" />
                <span class="min-w-0 truncate">{{ repo.name }}</span>
              </div>

              <div class="ml-1 flex shrink-0 items-center gap-1 text-[10px] tabular-nums">
                <span
                  v-if="repoStore.repoSyncStatuses[repo.path]?.incoming.length"
                  class="flex items-center gap-0.5 font-semibold text-rose-500"
                  :title="`${t('Incoming')} (${repoStore.repoSyncStatuses[repo.path].incoming.length})`"
                >
                  <ArrowDownCircle class="h-3 w-3" />
                  <span>{{ repoStore.repoSyncStatuses[repo.path].incoming.length }}</span>
                </span>
                <span
                  v-if="repoStore.repoSyncStatuses[repo.path]?.outgoing.length"
                  class="flex items-center gap-0.5 font-semibold text-emerald-500"
                  :title="`${t('Outgoing')} (${repoStore.repoSyncStatuses[repo.path].outgoing.length})`"
                >
                  <ArrowUpCircle class="h-3 w-3" />
                  <span>{{ repoStore.repoSyncStatuses[repo.path].outgoing.length }}</span>
                </span>
                <button
                  v-if="repoStore.repoList.length > 1"
                  @click.stop="repoStore.removeRepo(repo.path)"
                  class="shrink-0 p-0.5 rounded-[4px] hover:bg-destructive/15 hover:text-destructive text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
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
          class="space-y-0.5 rounded-[6px] transition-colors"
          :class="dragOverTarget === '__ungrouped__' ? 'bg-primary/10 ring-1 ring-primary/40 p-0.5' : ''"
          @dragenter="handleDragEnter"
          @dragover="handleGroupDragOver($event, '__ungrouped__')"
          @dragleave="handleGroupDragLeave($event, '__ungrouped__')"
          @drop="handleGroupDrop($event, null)"
        >
          <div
            v-if="draggingRepoPath && ungroupedRepositories.length === 0"
            class="px-2 py-1 text-[10px] text-muted-foreground italic text-center border border-dashed border-border rounded-[4px]"
          >
            {{ t('Drop here to ungroup') }}
          </div>
          <div
            v-for="repo in ungroupedRepositories"
            :key="repo.path"
            draggable="true"
            @dragstart.stop="handleRepoDragStart($event, repo.path)"
            @dragenter.stop="handleDragEnter"
            @dragover="handleRepoDragOver($event, repo.path)"
            @dragleave="handleRepoDragLeave($event, repo.path)"
            @drop="handleRepoDrop($event, repo.path)"
            @dragend="resetDragState"
            @click.stop="handleSwitchRepo(repo.path)"
            @contextmenu.prevent.stop="openRepositoryContextMenu($event, repo.path)"
            @keydown.enter.prevent="handleSwitchRepo(repo.path)"
            @keydown.space.prevent="handleSwitchRepo(repo.path)"
            role="button"
            tabindex="0"
            class="relative flex min-w-0 items-center justify-between px-2 py-1.5 rounded-[4px] cursor-pointer transition-colors text-xs group"
            :class="[
              repoStore.activeRepoPath === repo.path ? 'bg-primary/10 text-primary font-semibold border border-primary/25' : 'text-foreground hover:bg-accent/70',
              draggingRepoPath === repo.path ? 'opacity-50' : '',
            ]"
          >
            <div
              v-if="repoDropIndicator?.path === repo.path"
              class="pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-primary z-10"
              :class="repoDropIndicator.position === 'before' ? 'top-0' : 'bottom-0'"
            />
            <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              <FolderGit2 class="w-3.5 h-3.5 shrink-0" :class="repoStore.activeRepoPath === repo.path ? 'text-primary' : 'text-muted-foreground'" />
              <span class="min-w-0 truncate">{{ repo.name }}</span>
            </div>

            <div class="ml-1 flex shrink-0 items-center gap-1 text-[10px] tabular-nums">
              <span
                v-if="repoStore.repoSyncStatuses[repo.path]?.incoming.length"
                class="flex items-center gap-0.5 font-semibold text-rose-500"
                :title="`${t('Incoming')} (${repoStore.repoSyncStatuses[repo.path].incoming.length})`"
              >
                <ArrowDownCircle class="h-3 w-3" />
                <span>{{ repoStore.repoSyncStatuses[repo.path].incoming.length }}</span>
              </span>
              <span
                v-if="repoStore.repoSyncStatuses[repo.path]?.outgoing.length"
                class="flex items-center gap-0.5 font-semibold text-emerald-500"
                :title="`${t('Outgoing')} (${repoStore.repoSyncStatuses[repo.path].outgoing.length})`"
              >
                <ArrowUpCircle class="h-3 w-3" />
                <span>{{ repoStore.repoSyncStatuses[repo.path].outgoing.length }}</span>
              </span>
              <button
                v-if="repoStore.repoList.length > 1"
                @click.stop="repoStore.removeRepo(repo.path)"
                class="shrink-0 p-0.5 rounded-[4px] hover:bg-destructive/15 hover:text-destructive text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
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
    <div class="p-2">
      <div
        @click="isBranchesOpen = !isBranchesOpen"
        class="dbx-section-heading flex items-center justify-between px-1.5 py-1 rounded-[4px] cursor-pointer hover:text-foreground transition-colors"
      >
        <div class="flex items-center gap-1">
          <component :is="isBranchesOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
          <span>{{ t('Local Branches') }}</span>
          <span class="ml-0.5 px-1.5 py-0 rounded-full bg-secondary text-[10px] font-medium tabular-nums text-muted-foreground">{{ localBranches.length }}</span>
        </div>
        <button
          @click.stop="repoStore.openModal('branch')"
          class="p-1 rounded-[4px] hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
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
            <component :is="collapsedLocalBranchDirectories.has(row.node.path) ? Folder : FolderOpen" class="w-3.5 h-3.5 shrink-0 text-amber-500" />
            <span class="truncate">{{ row.node.name }}</span>
          </div>
          <div
            v-else
            @dblclick="handleCheckout(row.branch.name)"
            @click="handleLocateCommit(row.branch.target_commit_id)"
            @contextmenu.prevent="openContextMenu($event, row.branch)"
            :title="t('Click to locate in log; double-click to checkout')"
            class="flex min-w-0 items-center justify-between px-2 py-1.5 rounded-[4px] cursor-pointer transition-colors text-xs group"
            :class="row.branch.is_head ? 'bg-primary/10 text-primary font-semibold border-l-2 border-primary' : 'text-foreground hover:bg-accent/70'"
            :style="{ paddingLeft: `${0.5 + row.depth * 0.8}rem` }"
          >
            <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              <GitBranch class="w-3.5 h-3.5 shrink-0" :class="row.branch.is_head ? 'text-primary' : 'text-muted-foreground'" />
              <span class="min-w-0 truncate">{{ branchLeafName(row.branch.name) }}</span>
            </div>

            <div class="ml-1 flex shrink-0 items-center gap-1 text-[10px] tabular-nums">
              <span
                v-if="row.branch.behind_count"
                class="flex items-center gap-0.5 font-semibold text-rose-500"
                :title="`${t('Incoming')} (${row.branch.behind_count})`"
              >
                <ArrowDownCircle class="h-3 w-3" />
                <span>{{ row.branch.behind_count }}</span>
              </span>
              <span
                v-if="row.branch.ahead_count"
                class="flex items-center gap-0.5 font-semibold text-emerald-500"
                :title="`${t('Outgoing')} (${row.branch.ahead_count})`"
              >
                <ArrowUpCircle class="h-3 w-3" />
                <span>{{ row.branch.ahead_count }}</span>
              </span>
              <Check v-if="row.branch.is_head" class="w-3.5 h-3.5 text-primary shrink-0" />
              <button
                @click.stop="openContextMenu($event, row.branch)"
                class="shrink-0 p-0.5 rounded-[4px] hover:bg-accent text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
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
    <div class="p-2">
      <button
        class="w-full flex items-center justify-between rounded-[4px] px-2 py-1.5 text-muted-foreground hover:bg-accent/70 hover:text-foreground transition-colors"
        :title="t('Manage Worktrees')"
        @click="repoStore.openModal('worktreeManager')"
      >
        <span class="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase">
          <FolderGit2 class="w-3.5 h-3.5 text-teal-500" />
          {{ t('Worktrees') }}
        </span>
        <span class="text-[10px] text-primary font-medium">{{ t('Manage') }}</span>
      </button>
    </div>

    <!-- Remote Branches Section -->
    <div class="p-2">
      <div
        @click="isRemotesOpen = !isRemotesOpen"
        class="dbx-section-heading flex items-center justify-between px-1.5 py-1 rounded-[4px] cursor-pointer hover:text-foreground transition-colors"
      >
        <div class="flex items-center gap-1">
          <component :is="isRemotesOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
          <span>{{ t('Remote Branches') }}</span>
          <span class="ml-0.5 px-1.5 py-0 rounded-full bg-secondary text-[10px] font-medium tabular-nums text-muted-foreground">{{ remoteBranches.length }}</span>
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
            <component :is="collapsedRemoteBranchDirectories.has(row.node.path) ? Folder : FolderOpen" class="w-3.5 h-3.5 shrink-0 text-amber-500" />
            <span class="truncate">{{ row.node.name }}</span>
          </div>
          <div
            v-else
            @dblclick="handleCheckout(row.branch.name)"
            @click="handleLocateCommit(row.branch.target_commit_id)"
            @contextmenu.prevent="openContextMenu($event, row.branch)"
            :title="t('Click to locate in log; double-click to checkout')"
            class="flex items-center gap-1.5 px-2 py-1 rounded-[4px] hover:bg-accent/70 hover:text-foreground cursor-pointer truncate text-xs transition-colors"
            :style="{ paddingLeft: `${0.5 + row.depth * 0.8}rem` }"
          >
            <Globe class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span class="truncate">{{ branchLeafName(row.branch.name) }}</span>
          </div>
        </template>
      </div>
    </div>

    <!-- Tags Section -->
    <div class="p-2">
      <div
        @click="isTagsOpen = !isTagsOpen"
        class="dbx-section-heading flex items-center justify-between px-1.5 py-1 rounded-[4px] cursor-pointer hover:text-foreground transition-colors"
      >
        <div class="flex items-center gap-1 min-w-0">
          <component :is="isTagsOpen ? ChevronDown : ChevronRight" class="w-3 h-3 shrink-0" />
          <span class="truncate">{{ t('Tags') }}</span>
          <span class="ml-0.5 px-1.5 py-0 rounded-full bg-secondary text-[10px] font-medium tabular-nums text-muted-foreground">{{ repoStore.tags.length }}</span>
        </div>
        <div class="flex items-center gap-0.5 shrink-0">
          <button
            @click.stop="handleSyncTags"
            :disabled="isSyncingTags || !repoStore.remotes.length"
            data-testid="sync-tags-btn"
            class="p-1 rounded-[4px] hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
            :title="t('Sync Tags')"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="isSyncingTags ? 'animate-spin' : ''" />
          </button>
          <button
            @click.stop="handlePushAllTags"
            :disabled="!repoStore.tags.length || !repoStore.remotes.length"
            data-testid="push-all-tags-btn"
            class="p-1 rounded-[4px] hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
            :title="t('Push All Tags')"
          >
            <ArrowUpCircle class="w-3.5 h-3.5" />
          </button>
          <button
            @click.stop="repoStore.openModal('tag')"
            class="p-1 rounded-[4px] hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            :title="t('Create Tag')"
          >
            <Plus class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div v-if="isTagsOpen" class="mt-1 space-y-1 text-muted-foreground">
        <div v-if="repoStore.tags.length > 10" class="relative px-1">
          <Search class="w-3 h-3 text-muted-foreground/70 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            v-model="tagFilterQuery"
            type="text"
            :placeholder="t('Filter tags...')"
            class="w-full h-6 pl-6 pr-6 text-[11px] rounded-[4px] bg-background border border-border/80 text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <button
            v-if="tagFilterQuery"
            @click.stop="tagFilterQuery = ''"
            class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X class="w-3 h-3" />
          </button>
        </div>

        <div v-if="filteredTags.length === 0 && tagFilterQuery" class="px-2 py-1 text-[11px] text-muted-foreground/75 italic">
          {{ t('No matching tags') }}
        </div>

        <div v-else class="max-h-60 overflow-y-auto pr-0.5 space-y-0.5">
          <div
            v-for="tag in visibleTags"
            :key="tag.name"
            @click="handleLocateCommit(tag.target_commit_id)"
            class="group/tag flex items-center justify-between gap-1 px-2 py-1 rounded-[4px] hover:bg-accent/70 hover:text-foreground cursor-pointer text-xs transition-colors"
            :title="tag.message ? `${tag.name}: ${tag.message}` : tag.name"
          >
            <div class="flex items-center gap-1.5 min-w-0 flex-1">
              <Tag class="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span class="truncate">{{ tag.name }}</span>
            </div>
            <div class="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/tag:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                v-if="repoStore.remotes.length > 0"
                @click.stop="handlePushTag(tag.name)"
                class="p-0.5 rounded-[4px] hover:bg-accent text-muted-foreground hover:text-foreground"
                :title="t('Push Tag')"
              >
                <ArrowUpCircle class="w-3 h-3" />
              </button>
              <button
                @click.stop="handleDeleteTag(tag.name)"
                class="p-0.5 rounded-[4px] hover:bg-destructive/15 text-muted-foreground hover:text-destructive"
                :title="t('Delete Tag')"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <button
            v-if="filteredTags.length > visibleTags.length"
            @click.stop="visibleTagLimit += 100"
            class="w-full py-1 px-2 text-[11px] text-primary hover:bg-primary/10 rounded-[4px] transition-colors text-center font-medium"
          >
            {{ t('Show more ({count} remaining)', { count: filteredTags.length - visibleTags.length }) }}
          </button>
        </div>
      </div>
    </div>

    <!-- Stashes Section -->
    <div class="p-2">
      <div
        @click="isStashesOpen = !isStashesOpen"
        class="dbx-section-heading flex items-center justify-between px-1.5 py-1 rounded-[4px] cursor-pointer hover:text-foreground transition-colors"
      >
        <div class="flex items-center gap-1">
          <component :is="isStashesOpen ? ChevronDown : ChevronRight" class="w-3 h-3" />
          <span>{{ t('Stashes') }}</span>
          <span class="ml-0.5 px-1.5 py-0 rounded-full bg-secondary text-[10px] font-medium tabular-nums text-muted-foreground">{{ repoStore.stashes.length }}</span>
        </div>
        <button
          @click.stop="repoStore.openModal('stash')"
          class="p-1 rounded-[4px] hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
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
          class="flex items-center justify-between px-2 py-1 rounded-[4px] hover:bg-accent/70 hover:text-foreground cursor-pointer truncate group text-xs transition-colors"
        >
          <div class="flex items-center gap-1.5 truncate">
            <Archive class="w-3.5 h-3.5 text-orange-500 shrink-0" />
            <span class="truncate">{{ stash.message }}</span>
          </div>
          <span class="text-[10px] text-primary font-semibold opacity-0 group-hover:opacity-100 transition-opacity">{{ t('Manage') }}</span>
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
        @click="groupContextMenu = null; workspaceContextMenu = null"
        @contextmenu.prevent="groupContextMenu = null; workspaceContextMenu = null"
      >
        <div
          ref="groupMenuRef"
          class="fixed arco-menu w-52 text-xs select-none"
          :style="groupContextMenuStyle"
          role="menu"
          @click.stop
          @contextmenu.prevent
        >
          <button
            role="menuitem"
            class="arco-menu-item"
            @click="openAddRepoModal(groupContextMenu.groupName)"
          >
            <Plus class="h-3.5 w-3.5 text-primary" />
            <span>{{ t('Add Repository to Group') }}</span>
          </button>
          <button
            role="menuitem"
            class="arco-menu-item"
            @click="handleRenameGroup(groupContextMenu.groupName)"
          >
            <Edit3 class="h-3.5 w-3.5 text-muted-foreground" />
            <span>{{ t('Rename Group') }}</span>
          </button>
          <div class="arco-menu-divider"></div>
          <button
            role="menuitem"
            class="arco-menu-item disabled:opacity-50"
            :disabled="isBulkOperating"
            @click="handleFetchAllRepos"
          >
            <RefreshCw class="h-3.5 w-3.5 text-primary" />
            <span>{{ t('Fetch All') }}</span>
          </button>
          <button
            role="menuitem"
            class="arco-menu-item disabled:opacity-50"
            :disabled="isBulkOperating"
            @click="handlePullAllRepos"
          >
            <ArrowDownCircle class="h-3.5 w-3.5 text-rose-500" />
            <span>{{ t('Pull All') }}</span>
          </button>
          <button
            role="menuitem"
            class="arco-menu-item disabled:opacity-50"
            :disabled="isBulkOperating"
            @click="handlePushAllRepos"
          >
            <ArrowUpCircle class="h-3.5 w-3.5 text-emerald-500" />
            <span>{{ t('Push All') }}</span>
          </button>
          <div class="arco-menu-divider"></div>
          <button
            role="menuitem"
            class="arco-menu-item arco-menu-item-danger"
            @click="handleDeleteGroup(groupContextMenu.groupName)"
          >
            <Trash2 class="h-3.5 w-3.5" />
            <span>{{ t('Delete Group') }}</span>
          </button>
        </div>
      </div>
      <div
        v-if="workspaceContextMenu && !groupContextMenu"
        class="fixed inset-0 z-50"
        @click="workspaceContextMenu = null"
        @contextmenu.prevent="workspaceContextMenu = null"
      >
        <div
          ref="workspaceMenuRef"
          class="fixed arco-menu w-60 text-xs select-none"
          :style="workspaceContextMenuStyle"
          role="menu"
          @click.stop
          @contextmenu.prevent
        >
          <div class="arco-menu-section">
            {{ t('All Repositories ({count})', { count: repoStore.repoList.length }) }}
          </div>
          <button
            role="menuitem"
            class="arco-menu-item disabled:opacity-50"
            :disabled="isBulkOperating"
            @click="handleFetchAllRepos"
          >
            <RefreshCw class="h-3.5 w-3.5 text-primary" />
            <span>{{ t('Fetch All') }}</span>
          </button>
          <button
            role="menuitem"
            class="arco-menu-item disabled:opacity-50"
            :disabled="isBulkOperating"
            @click="handlePullAllRepos"
          >
            <ArrowDownCircle class="h-3.5 w-3.5 text-rose-500" />
            <span>{{ t('Pull All') }}</span>
          </button>
          <button
            role="menuitem"
            class="arco-menu-item disabled:opacity-50"
            :disabled="isBulkOperating"
            @click="handlePushAllRepos"
          >
            <ArrowUpCircle class="h-3.5 w-3.5 text-emerald-500" />
            <span>{{ t('Push All') }}</span>
          </button>
        </div>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
[draggable="true"] {
  -webkit-user-drag: element;
}
.branch-directory-row {
  align-items: center;
  border-radius: 4px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  display: flex;
  font-size: calc(10px * var(--gitbx-font-scale, 1));
  font-weight: 600;
  gap: 0.25rem;
  min-width: 0;
  padding-bottom: 0.3rem;
  padding-right: 0.5rem;
  padding-top: 0.3rem;
  transition: background-color 120ms ease, color 120ms ease;
}
.branch-directory-row:hover {
  background: hsl(var(--accent) / 0.7);
  color: hsl(var(--foreground));
}
</style>
