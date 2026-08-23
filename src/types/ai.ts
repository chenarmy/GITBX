export type LlmProvider = 'openai' | 'claude' | 'deepseek' | 'ollama' | 'custom';

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
