import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitbxFetch } from '@/api/common';
import { CONFIG_KEYS } from '@/services/appConfig';

describe('gitbxFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds the configured bearer token without dropping existing headers', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => key === CONFIG_KEYS.webToken ? ' secret-token ' : null),
    });
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await gitbxFetch('/api/repo/info', { headers: { Accept: 'application/json' } });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer secret-token');
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('does not send an authorization header when no token is configured', async () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null) });
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await gitbxFetch('/api/health');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
  });
});
