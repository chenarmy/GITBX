export type LlmProvider =
  | 'claude'
  | 'openai'
  | 'gemini'
  | 'deepseek'
  | 'kimi'
  | 'qwen'
  | 'zhipu'
  | 'minimax'
  | 'ollama'
  | 'anthropic-compatible'
  | 'openai-compatible'
  | 'claude-code-cli'
  | 'codex-cli'
  | 'opencode-cli'
  | 'cursor-cli'
  | 'codebuddy-code'
  | 'qoder-cli'
  | 'grok-cli'
  | 'pi-coding-agent'
  | 'custom'
  | 'openrouter';

export type AiMode = 'ask' | 'agent';

export type AiProviderProtocol =
  | 'openai'
  | 'claude'
  | 'gemini'
  | 'deepseek'
  | 'kimi'
  | 'qwen'
  | 'zhipu'
  | 'minimax'
  | 'ollama'
  | 'anthropic-compatible'
  | 'openai-compatible'
  | 'cli-agent'
  | 'custom'
  | 'openrouter';

export interface AiProviderConfig {
  id: string;
  name: string;
  protocol: AiProviderProtocol;
  api_base: string;
  api_key: string;
  default_model: string;
  category?: 'builtin' | 'cli';
  badge?: string;
  cli_command?: string;
  cli_path?: string;
  cli_args?: string;
  context_window?: number;
  max_output_tokens?: number;
  proxy?: string;
  is_default?: boolean;
}

export interface AiModelItem {
  id: string;
  name: string;
  provider_id: string;
  context_length?: number;
  description?: string;
}

export type AiToolName =
  | 'git_status'
  | 'git_diff'
  | 'git_log'
  | 'git_branch'
  | 'run_git_command';

export interface AiToolCall {
  id: string;
  name: AiToolName;
  arguments: Record<string, any>;
  risk_level: 'safe' | 'destructive';
  status: 'pending' | 'running' | 'success' | 'rejected' | 'failed';
  result?: string;
  error?: string;
  command?: string;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: number;
  mode?: AiMode;
  model_id?: string;
  provider_id?: string;
  tool_calls?: AiToolCall[];
  tool_call_id?: string;
  context_snapshot?: {
    repo_path: string;
    branch: string;
    staged_count?: number;
    unstaged_count?: number;
  };
}

export interface AiSession {
  id: string;
  title: string;
  repo_path: string;
  branch: string;
  created_at: number;
  updated_at: number;
  messages: AiMessage[];
}

export interface AiPromptTemplate {
  id: string;
  title: string;
  description?: string;
  prompt: string;
}

export interface LlmConfig {
  provider: LlmProvider;
  api_base: string;
  api_key?: string;
  model: string;
  temperature?: number;
}

export interface GeneratedCommitMessage {
  commit_type: string;
  scope?: string;
  summary: string;
  body?: string;
  raw_full_message: string;
}

export interface SecretDetection {
  rule_name: string;
  line_number: number;
  matched_snippet: string;
  severity: 'High' | 'Critical' | 'Medium';
}

export interface ConflictResolutionSuggestion {
  explanation: string;
  suggested_content: string;
}

