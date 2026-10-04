import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAiStore, DEFAULT_AI_PROVIDERS, AI_PROVIDER_PRESETS } from '../../src/stores/ai';
import { determineRiskLevel, formatCommandPreview } from '../../src/services/aiAgentService';

describe('AI Store and Agent Service', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key in store) delete store[key];
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key in store) delete store[key];
      },
    });
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initializes with default providers and active provider', () => {
    const aiStore = useAiStore();
    expect(aiStore.providers.length).toBeGreaterThanOrEqual(DEFAULT_AI_PROVIDERS.length);
    expect(aiStore.activeProviderId).toBe('openai');
    expect(aiStore.activeModelId).toBe('gpt-4o-mini');
    expect(aiStore.activeMode).toBe('agent');
  });

  it('switches provider and updates active model to provider default', () => {
    const aiStore = useAiStore();
    aiStore.setProvider('claude');
    expect(aiStore.activeProviderId).toBe('claude');
    expect(aiStore.activeModelId).toBe(AI_PROVIDER_PRESETS.claude.model);
    expect(aiStore.llmConfig.provider).toBe('claude');

    // Verify presence of required built-in and CLI providers
    const providerIds = aiStore.providers.map((p) => p.id);
    expect(providerIds).toContain('gemini');
    expect(providerIds).toContain('zhipu');
    expect(providerIds).toContain('minimax');
    expect(providerIds).toContain('cursor-cli');
    expect(providerIds).toContain('claude-code-cli');

    // Verify sponsors are completely removed
    expect(providerIds).not.toContain('aicodemirror');
    expect(providerIds).not.toContain('jalapeno-cloud');
    expect(providerIds).not.toContain('hualongai');

    // Verify every provider category is strictly builtin or cli
    aiStore.providers.forEach((p) => {
      expect(['builtin', 'cli']).toContain(p.category);
    });
  });

  it('manages sessions and messages properly', () => {
    const aiStore = useAiStore();
    const session = aiStore.createSession('Test Session', '/repo/path', 'main');
    expect(session).toBeDefined();
    expect(aiStore.activeSessionId).toBe(session.id);
    expect(aiStore.sessions.length).toBe(1);

    const msg = aiStore.addMessageToActiveSession({
      role: 'user',
      content: 'Explain git rebase',
      mode: 'ask',
    });
    expect(msg.content).toBe('Explain git rebase');
    expect(aiStore.activeSession?.messages.length).toBe(1);

    aiStore.deleteSession(session.id);
    expect(aiStore.sessions.length).toBe(0);
  });

  it('classifies risk level accurately for safe vs destructive operations', () => {
    expect(determineRiskLevel('git_status', {})).toBe('safe');
    expect(determineRiskLevel('git_diff', {})).toBe('safe');
    expect(determineRiskLevel('git_log', {})).toBe('safe');
    expect(determineRiskLevel('git_branch', {})).toBe('safe');

    expect(determineRiskLevel('run_git_command', { command: 'status' })).toBe('safe');
    expect(determineRiskLevel('run_git_command', { command: 'log' })).toBe('safe');

    expect(determineRiskLevel('run_git_command', { command: 'checkout', branch_name: 'dev' })).toBe('destructive');
    expect(determineRiskLevel('run_git_command', { command: 'commit', commit_message: 'feat: add ai' })).toBe('destructive');
    expect(determineRiskLevel('run_git_command', { command: 'push' })).toBe('destructive');
  });

  it('formats command previews correctly', () => {
    expect(formatCommandPreview('git_status', {})).toBe('git status');
    expect(formatCommandPreview('git_diff', { staged: true })).toBe('git diff --staged');
    expect(formatCommandPreview('run_git_command', { command: 'checkout', branch_name: 'feature-x' })).toBe('git checkout "feature-x"');
  });

  it('supports i18n multi-language localization for all AI features', async () => {
    const { useI18n } = await import('../../src/i18n');
    const { t, setLocale } = useI18n();

    // Simplified Chinese
    setLocale('zh-CN');
    expect(t('Built-in Support')).toBe('内置支持');
    expect(t('Featured Sponsors')).toBe('优质赞助商');
    expect(t('Ask Mode')).toBe('Ask 模式');
    expect(t('Agent Mode')).toBe('Agent 模式');
    expect(t('8 元免费额度')).toBe('8 元免费额度');
    expect(t('Follow Active Workspace (Recommended)')).toBe('跟随当前工作区（推荐）');

    // English
    setLocale('en');
    expect(t('Built-in Support')).toBe('Built-in Support');
    expect(t('Featured Sponsors')).toBe('Featured Sponsors');
    expect(t('8 元免费额度')).toBe('8 RMB Free Credit');
    expect(t('$1 免费额度')).toBe('$1 Free Credit');

    // Japanese
    setLocale('ja');
    expect(t('Built-in Support')).toBe('内蔵サポート');
    expect(t('Featured Sponsors')).toBe('おすすめスポンサー');

    // Restore to zh-CN
    setLocale('zh-CN');
  });
});
