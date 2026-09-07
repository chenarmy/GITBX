import { useRepoStore } from '@/stores/repo';
import { useConfirmationStore } from '@/stores/confirmation';
import { useNotificationStore } from '@/stores/notification';
import { formatGitError } from '@/composables/useGitApi';
import { useI18n } from '@/i18n';

export function isConflictCheckoutError(error: unknown): boolean {
  const raw = formatGitError(error, '').toLowerCase();
  return (
    raw.includes('conflict prevents checkout')
    || raw.includes('conflicts prevent checkout')
    || raw.includes('would be overwritten by checkout')
    || raw.includes('local changes conflict')
    || raw.includes('未提交的修改与目标分支冲突')
    || raw.includes('未提交的修改與目標分支衝突')
  );
}

export function useSmartCheckout() {
  const repoStore = useRepoStore();
  const confirmation = useConfirmationStore();
  const notification = useNotificationStore();
  const { t } = useI18n();

  const checkoutWithSmartFallback = async (branchName: string, isHead?: boolean) => {
    if (isHead) return;

    try {
      await repoStore.checkoutBranch(branchName);
    } catch (error) {
      if (isConflictCheckoutError(error)) {
        const confirmed = await confirmation.confirm({
          title: t('Smart Checkout'),
          message: t(
            'Local changes conflict with target branch "{branch}". Would you like to perform a Smart Checkout? GitBX will stash your changes, switch to "{branch}", and reapply your changes.',
            { branch: branchName },
          ),
          confirmText: t('Smart Checkout'),
          cancelText: t('Cancel'),
        });

        if (!confirmed) return;

        try {
          const { popConflict } = await repoStore.smartCheckoutBranch(branchName);
          if (popConflict) {
            notification.warning(
              t('Smart Checkout Completed with Conflicts'),
              t('Local changes were reapplied with conflicts. Please resolve them in the staging panel.'),
            );
          } else {
            notification.success(
              t('Smart Checkout Completed'),
              t('Switched to "{branch}" and restored uncommitted changes.', { branch: branchName }),
            );
          }
        } catch (smartError) {
          notification.error(t('Checkout Failed'), formatGitError(smartError));
        }
        return;
      }

      notification.error(t('Checkout Failed'), formatGitError(error));
    }
  };

  return {
    checkoutWithSmartFallback,
    isConflictCheckoutError,
  };
}
