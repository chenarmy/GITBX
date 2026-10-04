import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/api/common';
import type { McpPolicyConfig, McpServerInfo } from '@/types/mcp';

export const loadMcpPolicy = async (): Promise<McpPolicyConfig> => {
  if (isTauri()) {
    return await invoke<McpPolicyConfig>('load_mcp_policy');
  }
  return {
    version: 1,
    global_level: 'safe_write',
    allow_all_repos: true,
    allowed_repos: [],
    enabled_tools: [
      'gitbx_list_repos',
      'gitbx_status',
      'gitbx_branches',
      'gitbx_log',
      'gitbx_tags',
      'gitbx_diff',
      'gitbx_stage_file',
      'gitbx_stage_all',
      'gitbx_commit',
      'gitbx_create_branch',
      'gitbx_fetch',
    ],
    allow_active_repo_fallback: true,
  };
};

export const saveMcpPolicy = async (policy: McpPolicyConfig): Promise<string> => {
  if (isTauri()) {
    return await invoke<string>('save_mcp_policy', { policy });
  }
  return 'Saved in local storage (web mode)';
};

export const getMcpServerInfo = async (): Promise<McpServerInfo> => {
  if (isTauri()) {
    return await invoke<McpServerInfo>('get_mcp_server_info');
  }
  return {
    policy_path: '~/.gitbx/mcp-policy.json',
    binary_command: 'gitbx-mcp',
    available_tools: [],
    streamable_http_url: 'http://127.0.0.1:5226/mcp',
  };
};
