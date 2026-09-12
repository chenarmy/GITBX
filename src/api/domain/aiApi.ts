import { invoke } from '@tauri-apps/api/core';
import type {
  LlmConfig,
  GeneratedCommitMessage,
  SecretDetection,
  ConflictResolutionSuggestion,
} from '@/types/ai';
import type { Locale } from '@/i18n/config';
import { isTauri, getConsole, gitbxFetch } from '@/api/common';

export const generateCommitMessage = async (
  diffText: string,
  config?: LlmConfig,
  language: Locale = 'en',
): Promise<GeneratedCommitMessage> => {
  getConsole().logInfo(`AI generating commit message (${language})...`);
  let requestConfig: LlmConfig | undefined = config;
  if (isTauri() && config && !config.api_key) {
    try {
      const apiKey = await invoke<string>('get_credential', { provider: config.provider, username: 'default' });
      requestConfig = { ...config, api_key: apiKey };
    } catch {
      // Keyless local/custom providers are valid.
    }
  }
  if (isTauri()) {
    return await invoke<GeneratedCommitMessage>('generate_commit_message', {
      diffText,
      config: requestConfig,
      language,
    });
  }
  const res = await gitbxFetch('/api/ai/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ diff_text: diffText, config, language }),
  });
  if (!res.ok) throw new Error((await res.text()) || 'AI commit generation failed');
  return await res.json();
};

export const scanSecrets = async (diffText: string): Promise<SecretDetection[]> => {
  getConsole().logInfo(`AI Security scanner checking staged diff for sensitive tokens...`);
  if (isTauri()) {
    return await invoke<SecretDetection[]>('scan_secrets', { diffText });
  }
  const detections: SecretDetection[] = [];
  const rules: Array<[string, RegExp, SecretDetection['severity']]> = [
    ['AWS Access Key', /AKIA[0-9A-Z]{16}/i, 'Critical'],
    ['Private Key', /-----BEGIN (RSA|EC|OPENSSH|DSA|PRIVATE) KEY-----/, 'Critical'],
    ['GitHub Token', /(?:ghp_|github_pat_)[0-9A-Za-z_]+/, 'Critical'],
  ];
  diffText.split('\n').forEach((line, index) => {
    if (!line.startsWith('+') || line.startsWith('+++')) return;
    rules.forEach(([rule_name, pattern, severity]) => {
      const match = line.match(pattern);
      if (match) detections.push({ rule_name, line_number: index + 1, matched_snippet: match[0], severity });
    });
  });
  return detections;
};

export const analyzeConflict = async (
  filePath: string,
  ours: string,
  theirs: string,
  base?: string,
  config?: LlmConfig,
  language: Locale = 'en'
): Promise<ConflictResolutionSuggestion> => {
  getConsole().logInfo(`AI analyzing merge conflict in ${filePath}...`);
  const finalConfig: LlmConfig = config || { provider: 'openai', api_base: 'https://api.openai.com/v1', model: 'gpt-4o' };
  let requestConfig: LlmConfig = finalConfig;
  if (isTauri() && !finalConfig.api_key) {
    try {
      const apiKey = await invoke<string>('get_credential', { provider: finalConfig.provider, username: 'default' });
      requestConfig = { ...finalConfig, api_key: apiKey };
    } catch {
      // Keyless provider
    }
  }
  if (isTauri()) {
    return await invoke<ConflictResolutionSuggestion>('analyze_conflict', {
      filePath,
      ours,
      theirs,
      base,
      config: requestConfig,
      language,
    });
  }
  const res = await gitbxFetch('/api/ai/conflict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath, ours, theirs, base, config: requestConfig, language }),
  });
  if (!res.ok) throw new Error((await res.text()) || 'AI conflict analysis failed');
  return await res.json();
};

export const getCredential = async (provider: string, username = 'default'): Promise<string> => {
  if (!isTauri()) throw new Error('Credential storage is only available in the desktop keyring');
  return await invoke<string>('get_credential', { provider, username });
};

export const saveCredential = async (provider: string, token: string): Promise<void> => {
  if (!isTauri()) throw new Error('Credential storage is only available in the desktop keyring');
  await invoke('save_credential', { provider, username: 'default', token });
};
