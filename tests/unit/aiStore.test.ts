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

  it('recovers provider and model from legacy ai config when aiSelectedProvider is absent', () => {
    store['gitbx_ai_config'] = JSON.stringify({
      provider: 'deepseek',
      model: 'deepseek-chat',
      api_base: 'https://api.deepseek.com/v1',
    });
    const aiStore = useAiStore();
    expect(aiStore.activeProviderId).toBe('deepseek');
    expect(aiStore.activeModelId).toBe('deepseek-chat');
  });

  it('persists AI providers and selected provider/model in AppConfig and restores them on clean launch', async () => {
    const { readLocalConfig, applyConfig } = await import('../../src/services/appConfig');
    const aiStore = useAiStore();

    // User switches to DeepSeek and sets model
    aiStore.setProvider('deepseek');
    aiStore.setModel('deepseek-reasoner');

    expect(store['gitbx_ai_selected_provider']).toBe('deepseek');
    expect(store['gitbx_ai_selected_model']).toBe('deepseek-reasoner');

    const diskSnapshot = readLocalConfig();
    expect(diskSnapshot.aiSelectedProvider).toBe('deepseek');
    expect(diskSnapshot.aiSelectedModel).toBe('deepseek-reasoner');

    // Simulate app reinstallation: localStorage is completely wiped!
    for (const key in store) delete store[key];
    expect(store['gitbx_ai_selected_provider']).toBeUndefined();

    // Reinstalled app boots and applies saved disk config
    applyConfig(diskSnapshot);

    // Verify localStorage has been fully restored from disk config
    expect(store['gitbx_ai_selected_provider']).toBe('deepseek');
    expect(store['gitbx_ai_selected_model']).toBe('deepseek-reasoner');

    // Pinia store initializes in newly installed app
    setActivePinia(createPinia());
    const reinstalledAiStore = useAiStore();
    expect(reinstalledAiStore.activeProviderId).toBe('deepseek');
    expect(reinstalledAiStore.activeModelId).toBe('deepseek-reasoner');
  });

  it('switches between ask and agent modes correctly and persists to localStorage', () => {
    const aiStore = useAiStore();
    expect(aiStore.activeMode).toBe('agent');

    aiStore.setMode('ask');
    expect(aiStore.activeMode).toBe('ask');
    expect(store['gitbx_ai_mode']).toBe('ask');

    aiStore.setMode('agent');
    expect(aiStore.activeMode).toBe('agent');
    expect(store['gitbx_ai_mode']).toBe('agent');
  });

  it('creates, assigns, renames, deletes, and persists repository groups across config reloads', async () => {
    const { useRepoStore } = await import('../../src/stores/repo');
    const { readLocalConfig, applyConfig, CONFIG_KEYS } = await import('../../src/services/appConfig');

    store[CONFIG_KEYS.repositories] = JSON.stringify([
      { path: 'I:\\GITBX', name: 'GITBX', lastOpened: 1 },
      { path: 'I:\\godot_demo', name: 'godot_demo', lastOpened: 2 },
    ]);

    setActivePinia(createPinia());
    const repoStore = useRepoStore();

    // 1. Create group
    expect(repoStore.createRepoGroup('  前端项目  ')).toBe('前端项目');
    expect(repoStore.repoGroups).toEqual(['前端项目']);

    // 2. Assign repository to group
    repoStore.setRepoGroup('I:\\GITBX', '前端项目');
    expect(repoStore.repoList.find((r) => r.path === 'I:\\GITBX')?.group).toBe('前端项目');

    // 3. Assign to a new group auto-registers group
    repoStore.setRepoGroup('I:\\godot_demo', '游戏项目');
    expect(repoStore.repoGroups).toEqual(['前端项目', '游戏项目']);
    expect(repoStore.repoList.find((r) => r.path === 'I:\\godot_demo')?.group).toBe('游戏项目');

    // 4. Rename group updates both group list and assigned repos
    expect(repoStore.renameRepoGroup('前端项目', '核心工程')).toBe(true);
    expect(repoStore.repoGroups).toEqual(['核心工程', '游戏项目']);
    expect(repoStore.repoList.find((r) => r.path === 'I:\\GITBX')?.group).toBe('核心工程');

    // 5. Persist and restore via AppConfig
    const diskConfig = readLocalConfig();
    expect(diskConfig.repositories.groups).toEqual(['核心工程', '游戏项目']);
    expect(diskConfig.repositories.items.find((r) => r.path === 'I:\\GITBX')?.group).toBe('核心工程');

    for (const key in store) delete store[key];
    applyConfig(diskConfig);

    setActivePinia(createPinia());
    const restoredRepoStore = useRepoStore();
    expect(restoredRepoStore.repoGroups).toEqual(['核心工程', '游戏项目']);
    expect(restoredRepoStore.repoList.find((r) => r.path === 'I:\\GITBX')?.group).toBe('核心工程');

    // 6. Delete group ungroups its repos without deleting the repos
    restoredRepoStore.deleteRepoGroup('核心工程');
    expect(restoredRepoStore.repoGroups).toEqual(['游戏项目']);
    expect(restoredRepoStore.repoList.find((r) => r.path === 'I:\\GITBX')?.group).toBeUndefined();
    expect(restoredRepoStore.repoList.length).toBe(2);
  });
});
