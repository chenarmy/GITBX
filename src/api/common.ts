import { useConsoleStore } from '@/stores/console';
import { CONFIG_KEYS } from '@/services/appConfig';

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function gitbxFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  try {
    const token = localStorage.getItem(CONFIG_KEYS.webToken)?.trim();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  } catch {
    // Storage can be unavailable in hardened browser contexts. The server will
    // return a structured authentication error in that case.
  }
  return fetch(input, { ...init, headers });
}

export function formatGitError(error: unknown, fallback = 'Git operation failed'): string {
  if (typeof error === 'string' && error.trim()) {
    try {
      const parsed = JSON.parse(error);
      if (parsed && typeof parsed === 'object') {
        return formatGitError(parsed, fallback);
      }
    } catch {
      // not JSON string
    }
    return error;
  }
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    for (const key of ['message', 'detail', 'error', 'description']) {
      const nested = value[key];
      if (typeof nested === 'string' && nested.trim()) return nested;
      if (nested && nested !== error) {
        const formatted = formatGitError(nested, '');
        if (formatted) return formatted;
      }
    }
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') return serialized;
    } catch {
      // Fall through to the stable fallback.
    }
  }
  return fallback;
}

export function isNonFastForwardPushError(error: unknown): boolean {
  const message = formatGitError(error, '').toLowerCase();
  if (!message) return false;
  return message.includes('non-fast-forward')
    || message.includes('(fetch first)')
    || (
      (message.includes('updates were rejected') || message.includes('failed to push some refs'))
      && (
        message.includes('tip of your current branch is behind')
        || message.includes('remote contains work')
        || message.includes('fetch first')
      )
    );
}

export async function parseGitResponse<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    throw new Error(formatGitError(data, `${fallback} (HTTP ${res.status})`));
  }
  return data as T;
}

export async function parseOperationResult(
  res: Response,
  fallback: string
): Promise<{ success: boolean; conflict?: boolean; error?: string; output?: string }> {
  const data = await res.json().catch(() => null);
  if (res.ok && data?.success) return data;
  const error = data?.error ?? data;
  return {
    success: false,
    conflict: Boolean(error?.conflict),
    error: formatGitError(error, `${fallback} (HTTP ${res.status})`),
  };
}

export function isConflictError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    if ('conflict' in error && Boolean((error as any).conflict)) return true;
    if ('code' in error && (error as any).code === 'CONFLICT') return true;
  }
  if (typeof error === 'string') {
    try {
      const parsed = JSON.parse(error);
      if (parsed && typeof parsed === 'object') {
        return isConflictError(parsed);
      }
    } catch {}
  }
  return /conflict|unmerged/i.test(formatGitError(error, ''));
}

export function redactRemoteUrl(url: string): string {
  return url.replace(/(https?:\/\/)([^\s/@:]+)(?::[^\s/@]*)?@/i, '$1$2:***@');
}

export const getConsole = () => useConsoleStore();
