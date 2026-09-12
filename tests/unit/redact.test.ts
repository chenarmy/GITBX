import { describe, expect, it } from 'vitest';
import { redactRemoteUrl } from '../../src/api/common';

describe('redactRemoteUrl', () => {
  it('masks basic password in http/https URLs', () => {
    const raw = 'https://user:secret123@github.com/org/repo.git';
    expect(redactRemoteUrl(raw)).toBe('https://user:***@github.com/org/repo.git');
  });

  it('masks personal access token in URL with empty username or token-only', () => {
    const raw = 'https://ghp_abcdef1234567890@github.com/org/repo.git';
    expect(redactRemoteUrl(raw)).toBe('https://ghp_abcdef1234567890:***@github.com/org/repo.git');
  });

  it('preserves URLs without credentials', () => {
    const raw = 'https://github.com/org/repo.git';
    expect(redactRemoteUrl(raw)).toBe('https://github.com/org/repo.git');
  });

  it('preserves SSH format URLs', () => {
    const raw = 'git@github.com:org/repo.git';
    expect(redactRemoteUrl(raw)).toBe('git@github.com:org/repo.git');
  });
});
