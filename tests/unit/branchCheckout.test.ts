import { describe, expect, it } from 'vitest';
import { isCheckoutOverwriteError } from '@/composables/useBranchCheckout';

describe('checkout overwrite detection', () => {
  it.each([
    'Git error: 1 conflict prevents checkout',
    'Your local changes to the following files would be overwritten by checkout',
    'Commit or stash your uncommitted changes before switching branches',
  ])('recognizes a local-change checkout failure: %s', (message) => {
    expect(isCheckoutOverwriteError(new Error(message))).toBe(true);
  });

  it('does not offer Smart Checkout for unrelated failures', () => {
    expect(isCheckoutOverwriteError(new Error("Branch 'missing' not found"))).toBe(false);
  });
});
