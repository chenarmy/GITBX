import { isNonFastForwardPushError } from '@/composables/useGitApi';
import { useConfirmationStore } from '@/stores/confirmation';
import { useRepoStore } from '@/stores/repo';
import { useI18n } from '@/i18n';

interface PushOptions {
  forceWithLease?: boolean;
}

export function usePushRecovery() {
  const repoStore = useRepoStore();
  const confirmation = useConfirmationStore();
  const { t } = useI18n();

  const confirmReplacement = (automaticRecovery: boolean) => confirmation.confirm({
    title: automaticRecovery ? t('Remote Branch Has New Commits') : t('Force Push with Lease'),
    message: t('Fetch the latest remote state, then replace the remote branch with your local branch? Commits that exist only on the remote will be removed.'),
    danger: true,
    confirmText: t('Continue Push'),
  });

  const pushWithRecovery = async (options: PushOptions = {}): Promise<boolean> => {
    const forceWithLease = options.forceWithLease === true;
    if (forceWithLease && !(await confirmReplacement(false))) return false;

    try {
      await repoStore.pushRemote(forceWithLease);
      return true;
    } catch (error) {
      if (forceWithLease || !isNonFastForwardPushError(error)) throw error;
      if (!(await confirmReplacement(true))) return false;
      await repoStore.pushRemote(true);
      return true;
    }
  };

  return { pushWithRecovery };
}
