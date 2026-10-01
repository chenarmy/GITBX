import { isNonFastForwardPushError } from '@/composables/useGitApi';
import { useConfirmationStore } from '@/stores/confirmation';
import { useRepoStore } from '@/stores/repo';
import { useI18n } from '@/i18n';

interface PushOptions {
  forceWithLease?: boolean;
  pullStrategy?: 'merge' | 'rebase' | 'ff-only';
  branchName?: string;
}

export function usePushRecovery() {
  const repoStore = useRepoStore();
  const confirmation = useConfirmationStore();
  const { t } = useI18n();

  const confirmReplacement = () => confirmation.confirm({
    title: t('Force Push with Lease'),
    message: t('Fetch the latest remote state, then replace the remote branch with your local branch? Commits that exist only on the remote will be removed.'),
    danger: true,
    confirmText: t('Continue Push'),
  });

  const confirmPullAndPush = () => confirmation.confirm({
    title: t('Remote Branch Has New Commits'),
    message: t('Pull remote changes into the current branch, then retry the push? If conflicts occur, resolve them before pushing again.'),
    confirmText: t('Pull and Push'),
  });

  const pushWithRecovery = async (options: PushOptions = {}): Promise<boolean> => {
    const forceWithLease = options.forceWithLease === true;
    if (forceWithLease && !(await confirmReplacement())) return false;

    try {
      await repoStore.pushRemote(forceWithLease, options.branchName);
      return true;
    } catch (error) {
      if (forceWithLease || !isNonFastForwardPushError(error)) throw error;
      // Pull operates on the checked-out branch. Never recover a push of a
      // different branch by pulling unrelated commits into the current one.
      if (options.branchName && options.branchName !== repoStore.repoInfo?.head_branch) throw error;
      if (!(await confirmPullAndPush())) return false;
      await repoStore.pullRemote(options.pullStrategy || 'merge');
      await repoStore.pushRemote(false, options.branchName);
      return true;
    }
  };

  return { pushWithRecovery };
}
