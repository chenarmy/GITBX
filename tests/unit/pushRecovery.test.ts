import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  pullRemote: vi.fn(),
  pushRemote: vi.fn(),
  repoInfo: { head_branch: 'main' },
}));

vi.mock('@/stores/confirmation', () => ({
  useConfirmationStore: () => ({ confirm: mocks.confirm }),
}));
vi.mock('@/stores/repo', () => ({
  useRepoStore: () => ({
    pullRemote: mocks.pullRemote,
    pushRemote: mocks.pushRemote,
    repoInfo: mocks.repoInfo,
  }),
}));
vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { usePushRecovery } from '@/composables/usePushRecovery';

describe('push recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirm.mockResolvedValue(true);
    mocks.pullRemote.mockResolvedValue(undefined);
  });

  it('pulls safely and retries a normal push after non-fast-forward rejection', async () => {
    mocks.pushRemote
      .mockRejectedValueOnce(new Error('Updates were rejected because the remote contains work (fetch first)'))
      .mockResolvedValueOnce(undefined);

    const result = await usePushRecovery().pushWithRecovery({ pullStrategy: 'rebase' });

    expect(result).toBe(true);
    expect(mocks.pullRemote).toHaveBeenCalledWith('rebase');
    expect(mocks.pushRemote).toHaveBeenNthCalledWith(1, false, undefined);
    expect(mocks.pushRemote).toHaveBeenNthCalledWith(2, false, undefined);
    expect(mocks.pushRemote).not.toHaveBeenCalledWith(true);
  });

  it('keeps force-with-lease behind its explicit confirmation', async () => {
    mocks.pushRemote.mockResolvedValue(undefined);

    const result = await usePushRecovery().pushWithRecovery({ forceWithLease: true });

    expect(result).toBe(true);
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(mocks.pullRemote).not.toHaveBeenCalled();
    expect(mocks.pushRemote).toHaveBeenCalledWith(true, undefined);
  });

  it('pushes the explicitly selected branch', async () => {
    mocks.pushRemote.mockResolvedValue(undefined);

    const result = await usePushRecovery().pushWithRecovery({ branchName: 'feature/demo' });

    expect(result).toBe(true);
    expect(mocks.pushRemote).toHaveBeenCalledWith(false, 'feature/demo');
  });

  it('does not pull the current branch when a different branch push is rejected', async () => {
    const error = new Error('Updates were rejected because the remote contains work (fetch first)');
    mocks.pushRemote.mockRejectedValue(error);

    await expect(
      usePushRecovery().pushWithRecovery({ branchName: 'feature/demo' }),
    ).rejects.toThrow(error.message);

    expect(mocks.pullRemote).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
