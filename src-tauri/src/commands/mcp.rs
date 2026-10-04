use gitbx_contracts::McpPolicyConfig;
use gitbx_core::path_for_display;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;

const CONFIG_DIR_NAME: &str = ".gitbx";
const MCP_POLICY_FILE_NAME: &str = "mcp-policy.json";

fn mcp_policy_path() -> Result<PathBuf, String> {
    let home =
        dirs::home_dir().ok_or_else(|| "Unable to locate the user home directory".to_string())?;
    Ok(home.join(CONFIG_DIR_NAME).join(MCP_POLICY_FILE_NAME))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpToolInfo {
    pub name: String,
    pub description: String,
    pub risk_level: String, // "read" | "write" | "admin"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpServerInfo {
    pub policy_path: String,
    pub binary_command: String,
    pub available_tools: Vec<McpToolInfo>,
    pub streamable_http_url: String,
}

#[tauri::command]
pub async fn load_mcp_policy() -> Result<McpPolicyConfig, String> {
    let path = mcp_policy_path()?;
    if !path.exists() {
        return Ok(McpPolicyConfig::default());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read MCP policy at {}: {e}", path.display()))?;
    serde_json::from_str::<McpPolicyConfig>(&content)
        .map_err(|e| format!("Invalid MCP policy format at {}: {e}", path.display()))
}

#[tauri::command]
pub async fn save_mcp_policy(policy: McpPolicyConfig) -> Result<String, String> {
    let path = mcp_policy_path()?;
    let parent = path
        .parent()
        .ok_or_else(|| "MCP policy path has no parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|e| {
        format!(
            "Failed to create directory {}: {e}",
            parent.display()
        )
    })?;

    let content = serde_json::to_vec_pretty(&policy)
        .map_err(|e| format!("Failed to serialize MCP policy: {e}"))?;

    let temp_path = path.with_extension(format!("tmp.{}", std::process::id()));
    {
        let mut file = fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&temp_path)
            .map_err(|e| {
                format!(
                    "Failed to open temporary policy file {}: {e}",
                    temp_path.display()
                )
            })?;
        file.write_all(&content)
            .map_err(|e| format!("Failed to write policy file: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("Failed to sync policy file: {e}"))?;
    }

    fs::rename(&temp_path, &path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("Failed to replace policy file {}: {e}", path.display())
    })?;

    Ok(path_for_display(&path))
}

#[tauri::command]
pub async fn get_mcp_server_info() -> Result<McpServerInfo, String> {
    let path = mcp_policy_path()?;
    let available_tools = vec![
        McpToolInfo {
            name: "gitbx_list_repos".to_string(),
            description: "列出 GITBX 授权可见的仓库列表".to_string(),
            risk_level: "read".to_string(),
        },
        McpToolInfo {
            name: "gitbx_status".to_string(),
            description: "获取仓库工作区与暂存区状态".to_string(),
            risk_level: "read".to_string(),
        },
        McpToolInfo {
            name: "gitbx_branches".to_string(),
            description: "列出本地与远程分支".to_string(),
            risk_level: "read".to_string(),
        },
        McpToolInfo {
            name: "gitbx_log".to_string(),
            description: "获取提交历史记录".to_string(),
            risk_level: "read".to_string(),
        },
        McpToolInfo {
            name: "gitbx_tags".to_string(),
            description: "列出所有 Git 标签".to_string(),
            risk_level: "read".to_string(),
        },
        McpToolInfo {
            name: "gitbx_diff".to_string(),
            description: "查询文件差异比对".to_string(),
            risk_level: "read".to_string(),
        },
        McpToolInfo {
            name: "gitbx_stage_file".to_string(),
            description: "暂存指定文件变更".to_string(),
            risk_level: "write".to_string(),
        },
        McpToolInfo {
            name: "gitbx_stage_all".to_string(),
            description: "暂存工作区所有变更".to_string(),
            risk_level: "write".to_string(),
        },
        McpToolInfo {
            name: "gitbx_commit".to_string(),
            description: "提交已暂存的代码 (受保护分支自动拦截)".to_string(),
            risk_level: "write".to_string(),
        },
        McpToolInfo {
            name: "gitbx_create_branch".to_string(),
            description: "创建新的本地开发特性分支".to_string(),
            risk_level: "write".to_string(),
        },
        McpToolInfo {
            name: "gitbx_fetch".to_string(),
            description: "拉取远程仓库元数据".to_string(),
            risk_level: "write".to_string(),
        },
        McpToolInfo {
            name: "gitbx_merge".to_string(),
            description: "合并目标分支 (需要完全访问权限)".to_string(),
            risk_level: "admin".to_string(),
        },
        McpToolInfo {
            name: "gitbx_rebase".to_string(),
            description: "变基分支历史 (需要完全访问权限)".to_string(),
            risk_level: "admin".to_string(),
        },
        McpToolInfo {
            name: "gitbx_cherry_pick".to_string(),
            description: "拣选特定提交 (需要完全访问权限)".to_string(),
            risk_level: "admin".to_string(),
        },
        McpToolInfo {
            name: "gitbx_reset".to_string(),
            description: "重置分支 HEAD (高危破坏性操作)".to_string(),
            risk_level: "admin".to_string(),
        },
        McpToolInfo {
            name: "gitbx_pull".to_string(),
            description: "拉取并合并远程变更".to_string(),
            risk_level: "admin".to_string(),
        },
        McpToolInfo {
            name: "gitbx_push".to_string(),
            description: "向远程仓库推送提交 (受保护分支禁推)".to_string(),
            risk_level: "admin".to_string(),
        },
    ];

    Ok(McpServerInfo {
        policy_path: path_for_display(&path),
        binary_command: "gitbx-mcp".to_string(),
        available_tools,
        streamable_http_url: "http://127.0.0.1:5226/mcp".to_string(),
    })
}
