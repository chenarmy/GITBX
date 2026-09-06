import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ModalType =
  | 'addRepo'
  | 'branch'
  | 'tag'
  | 'stash'
  | 'merge'
  | 'rebase'
  | 'renameBranch'
  | 'reset'
  | 'remote'
  | 'syncStatus'
  | 'worktreeManager'
  | 'pullRequest';

export const useUiStore = defineStore('ui', () => {
  const isAddRepoModalOpen = ref<boolean>(false);
  const isBranchModalOpen = ref<boolean>(false);
  const isTagModalOpen = ref<boolean>(false);
  const isStashModalOpen = ref<boolean>(false);
  const isMergeModalOpen = ref<boolean>(false);
  const isRebaseModalOpen = ref<boolean>(false);
  const isRenameBranchModalOpen = ref<boolean>(false);
  const isResetModalOpen = ref<boolean>(false);
  const isRemoteModalOpen = ref<boolean>(false);
  const isSyncStatusOpen = ref<boolean>(false);
  const isWorktreeManagerOpen = ref<boolean>(false);
  const isPullRequestOpen = ref<boolean>(false);

  const targetBranchForAction = ref<string>('');
  const targetCommitForAction = ref<string>('');

  function openModal(modal: ModalType) {
    switch (modal) {
      case 'addRepo': isAddRepoModalOpen.value = true; break;
      case 'branch': isBranchModalOpen.value = true; break;
      case 'tag': isTagModalOpen.value = true; break;
      case 'stash': isStashModalOpen.value = true; break;
      case 'merge': isMergeModalOpen.value = true; break;
      case 'rebase': isRebaseModalOpen.value = true; break;
      case 'renameBranch': isRenameBranchModalOpen.value = true; break;
      case 'reset': isResetModalOpen.value = true; break;
      case 'remote': isRemoteModalOpen.value = true; break;
      case 'syncStatus': isSyncStatusOpen.value = true; break;
      case 'worktreeManager': isWorktreeManagerOpen.value = true; break;
      case 'pullRequest': isPullRequestOpen.value = true; break;
    }
  }

  function closeModal(modal: ModalType) {
    switch (modal) {
      case 'addRepo': isAddRepoModalOpen.value = false; break;
      case 'branch': isBranchModalOpen.value = false; break;
      case 'tag': isTagModalOpen.value = false; break;
      case 'stash': isStashModalOpen.value = false; break;
      case 'merge': isMergeModalOpen.value = false; break;
      case 'rebase': isRebaseModalOpen.value = false; break;
      case 'renameBranch': isRenameBranchModalOpen.value = false; break;
      case 'reset': isResetModalOpen.value = false; break;
      case 'remote': isRemoteModalOpen.value = false; break;
      case 'syncStatus': isSyncStatusOpen.value = false; break;
      case 'worktreeManager': isWorktreeManagerOpen.value = false; break;
      case 'pullRequest': isPullRequestOpen.value = false; break;
    }
  }

  function closeAllModals() {
    isAddRepoModalOpen.value = false;
    isBranchModalOpen.value = false;
    isTagModalOpen.value = false;
    isStashModalOpen.value = false;
    isMergeModalOpen.value = false;
    isRebaseModalOpen.value = false;
    isRenameBranchModalOpen.value = false;
    isResetModalOpen.value = false;
    isRemoteModalOpen.value = false;
    isSyncStatusOpen.value = false;
    isWorktreeManagerOpen.value = false;
    isPullRequestOpen.value = false;
  }

  return {
    isAddRepoModalOpen,
    isBranchModalOpen,
    isTagModalOpen,
    isStashModalOpen,
    isMergeModalOpen,
    isRebaseModalOpen,
    isRenameBranchModalOpen,
    isResetModalOpen,
    isRemoteModalOpen,
    isSyncStatusOpen,
    isWorktreeManagerOpen,
    isPullRequestOpen,
    targetBranchForAction,
    targetCommitForAction,
    openModal,
    closeModal,
    closeAllModals,
  };
});
