import { formatGitError } from '@/composables/useGitApi';
import { useI18n } from '@/i18n';
import { useConfirmationStore } from '@/stores/confirmation';
import { useNotificationStore } from '@/stores/notification';
import { useRepoStore } from '@/stores/repo';

export function isCheckoutOverwriteError(error: unknown): boolean {
  return /local changes|would be overwritten|uncommitted|conflict(?:s)? prevent(?:s|ed)? checkout|checkout.*conflict/i
    .test(formatGitError(error, ''));
}

export function useBranchCheckout() {
  const repoStore = useRepoStore();
  const confirmation = useConfirmationStore();
  const notification = useNotificationStore();
  const { t } = useI18n();

  const checkoutBranch = async (branchName: string): Promise<boolean> => {
    if (branchName === repoStore.repoInfo?.head_branch) return true;

    try {
      await repoStore.checkoutBranch(branchName);
      notification.success(t('Branch Switched'), t("Switched to branch '{branch}'.", { branch: branchName }));
      return true;
    } catch (error) {
      const hasLocalChanges = Boolean(repoStore.repoInfo?.is_dirty || repoStore.statusSummary.total_changes);
      if (!hasLocalChanges || !isCheckoutOverwriteError(error)) {
        notification.error(t('Failed to switch branch'), formatGitError(error));
        return false;
      }

      const approved = await confirmation.confirm({
        title: t('Local Changes Would Be Overwritten'),
        message: t("Switching to '{branch}' would overwrite local changes. Smart Checkout will temporarily stash all changes, switch branches, and restore them on the target branch.", { branch: branchName }),
        confirmText: t('Smart Checkout'),
      });
      if (!approved) return false;

      try {
        const result = await repoStore.checkoutBranch(branchName, true);
        if (result.conflicts) {
          notification.warning(
            t('Branch Switched with Conflicts'),
            result.stash_kept
              ? t('Local changes were restored with conflicts. A backup remains in Stashes until you finish resolving them.')
              : t('Local changes were restored with conflicts.'),
          );
        } else {
          notification.success(t('Smart Checkout Complete'), t("Switched to branch '{branch}' and restored local changes.", { branch: branchName }));
        }
        return true;
      } catch (smartError) {
        await repoStore.loadRepo(repoStore.activeRepoPath);
        notification.error(t('Smart Checkout Failed'), formatGitError(smartError));
        return false;
      }
    }
  };

  return { checkoutBranch };
}
