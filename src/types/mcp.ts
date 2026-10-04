export type McpPermissionLevel = 'read_only' | 'safe_write' | 'full_access';

export interface McpRepoRule {
  repo_path: string;
  group_name?: string;
  override_level?: McpPermissionLevel;
  protected_branches: string[];
  allow_remote_fetch: boolean;
  allow_remote_push: boolean;
  allow_force_push: boolean;
}

export interface McpPolicyConfig {
  version: number;
  global_level: McpPermissionLevel;
  allow_all_repos: boolean;
  allowed_repos: McpRepoRule[];
  enabled_tools: string[];
  allow_active_repo_fallback: boolean;
}

export interface McpToolInfo {
  name: string;
  description: string;
  risk_level: 'read' | 'write' | 'admin';
}

export interface McpServerInfo {
  policy_path: string;
  binary_command: string;
  available_tools: McpToolInfo[];
  streamable_http_url: string;
}
