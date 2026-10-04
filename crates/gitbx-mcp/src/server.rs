use crate::{policy::PolicyEngine, tools::McpTools};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, BufRead, Write};
use std::sync::Mutex;

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    #[serde(rename = "jsonrpc")]
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}

pub struct McpServer;

impl McpServer {
    pub async fn run_stdio() -> anyhow::Result<()> {
        let stdin = io::stdin();
        let mut stdout = io::stdout();

        for line_res in stdin.lock().lines() {
            let line = line_res?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let resp = match serde_json::from_str::<JsonRpcRequest>(trimmed) {
                Ok(req) => {
                    if req.jsonrpc != "2.0" {
                        JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id: req.id,
                            result: None,
                            error: Some(serde_json::json!({
                                "code": -32600,
                                "message": "Invalid Request: jsonrpc must be '2.0'"
                            })),
                        }
                    } else {
                        Self::handle_request(req, crate::policy::global_policy()).await
                    }
                }
                Err(err) => JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: None,
                    result: None,
                    error: Some(serde_json::json!({
                        "code": -32700,
                        "message": format!("Parse error: {err}")
                    })),
                },
            };
            let out = serde_json::to_string(&resp)?;
            writeln!(stdout, "{}", out)?;
            stdout.flush()?;
        }

        Ok(())
    }

    pub fn all_tools() -> Vec<Value> {
        vec![
            serde_json::json!({
                "name": "gitbx_list_repos",
                "description": "List all repositories authorized in GITBX MCP policy",
                "inputSchema": {
                    "type": "object",
                    "properties": {}
                }
            }),
            serde_json::json!({
                "name": "gitbx_status",
                "description": "Get status of the Git repository",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "repo_path": { "type": "string" }
                    },
                    "required": ["repo_path"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_branches",
                "description": "List all branches",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "repo_path": { "type": "string" }
                    },
                    "required": ["repo_path"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_log",
                "description": "Read recent commits from the Git repository",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "repo_path": { "type": "string" },
                        "max_count": { "type": "integer", "minimum": 1, "maximum": 500 }
                    },
                    "required": ["repo_path"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_tags",
                "description": "List Git tags",
                "inputSchema": {
                    "type": "object",
                    "properties": { "repo_path": { "type": "string" } },
                    "required": ["repo_path"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_diff",
                "description": "Read a structured diff for a repository file",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "repo_path": { "type": "string" },
                        "file_path": { "type": "string" },
                        "staged": { "type": "boolean" }
                    },
                    "required": ["repo_path", "file_path"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_stage_file",
                "description": "Stage a file",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "repo_path": { "type": "string" },
                        "file_path": { "type": "string" }
                    },
                    "required": ["repo_path", "file_path"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_stage_all",
                "description": "Stage all working tree changes (write mode)",
                "inputSchema": {
                    "type": "object",
                    "properties": { "repo_path": { "type": "string" } },
                    "required": ["repo_path"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_create_branch",
                "description": "Create a local branch (write mode)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "repo_path": { "type": "string" },
                        "name": { "type": "string" },
                        "checkout": { "type": "boolean" }
                    },
                    "required": ["repo_path", "name"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_merge",
                "description": "Merge a branch or revision (full access mode)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "repo_path": { "type": "string" },
                        "target": { "type": "string" }
                    },
                    "required": ["repo_path", "target"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_rebase",
                "description": "Rebase the current branch (full access mode)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "repo_path": { "type": "string" },
                        "upstream": { "type": "string" }
                    },
                    "required": ["repo_path", "upstream"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_cherry_pick",
                "description": "Cherry-pick a commit (full access mode)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "repo_path": { "type": "string" },
                        "commit_id": { "type": "string" }
                    },
                    "required": ["repo_path", "commit_id"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_reset",
                "description": "Reset the current branch (full access mode)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "repo_path": { "type": "string" },
                        "target": { "type": "string" },
                        "mode": { "type": "string", "enum": ["--soft", "--mixed", "--hard"] }
                    },
                    "required": ["repo_path", "target"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_fetch",
                "description": "Fetch all remotes",
                "inputSchema": {
                    "type": "object",
                    "properties": { "repo_path": { "type": "string" } },
                    "required": ["repo_path"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_pull",
                "description": "Pull from origin (full access mode)",
                "inputSchema": {
                    "type": "object",
                    "properties": { "repo_path": { "type": "string" } },
                    "required": ["repo_path"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_push",
                "description": "Push current branch to origin (full access mode)",
                "inputSchema": {
                    "type": "object",
                    "properties": { "repo_path": { "type": "string" } },
                    "required": ["repo_path"]
                }
            }),
            serde_json::json!({
                "name": "gitbx_commit",
                "description": "Commit staged changes",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "repo_path": { "type": "string" },
                        "message": { "type": "string" },
                        "author": { "type": "string" },
                        "email": { "type": "string" }
                    },
                    "required": ["repo_path", "message", "author", "email"]
                }
            }),
        ]
    }

    async fn handle_request(
        req: JsonRpcRequest,
        policy_engine: &Mutex<PolicyEngine>,
    ) -> JsonRpcResponse {
        match req.method.as_str() {
            "initialize" => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: req.id,
                result: Some(serde_json::json!({
                    "protocolVersion": "2024-11-05",
                    "serverInfo": {
                        "name": "gitbx-mcp",
                        "version": env!("CARGO_PKG_VERSION")
                    },
                    "capabilities": {
                        "tools": {}
                    }
                })),
                error: None,
            },
            "tools/list" => {
                let enabled_tools: Vec<String> = {
                    let mut policy = policy_engine.lock().unwrap_or_else(|e| e.into_inner());
                    policy.get_policy().enabled_tools.clone()
                };

                let filtered: Vec<Value> = Self::all_tools()
                    .into_iter()
                    .filter(|tool| {
                        let name = tool["name"].as_str().unwrap_or("");
                        enabled_tools.iter().any(|e| e == name)
                    })
                    .collect();

                JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: req.id,
                    result: Some(serde_json::json!({
                        "tools": filtered
                    })),
                    error: None,
                }
            }
            "tools/call" => {
                let params = req.params.unwrap_or(Value::Null);
                let tool_name = params["name"].as_str().unwrap_or("");
                let args = &params["arguments"];
                let repo_path_opt = args["repo_path"].as_str();

                let auth_result = {
                    let mut policy = policy_engine.lock().unwrap_or_else(|e| e.into_inner());
                    policy
                        .authorize_tool_call(tool_name, repo_path_opt)
                        .and_then(|_| {
                            if tool_name == "gitbx_create_branch" {
                                policy.authorize_branch_creation(
                                    repo_path_opt.unwrap_or_default(),
                                    args["name"].as_str().unwrap_or_default(),
                                )
                            } else {
                                Ok(())
                            }
                        })
                };

                if let Err(auth_err) = auth_result {
                    return JsonRpcResponse {
                        jsonrpc: "2.0".to_string(),
                        id: req.id,
                        result: None,
                        error: Some(serde_json::json!({
                            "code": -32001,
                            "message": format!("Policy Violation: {auth_err}")
                        })),
                    };
                }

                let res = match tool_name {
                    "gitbx_list_repos" => {
                        let mut policy = policy_engine.lock().unwrap_or_else(|e| e.into_inner());
                        let repositories = policy.get_allowed_repo_paths();
                        let allow_all = policy.get_policy().allow_all_repos;
                        Ok(serde_json::json!({
                            "repositories": repositories,
                            "allow_all": allow_all
                        }))
                    }
                    "gitbx_status" => {
                        let repo_path = args["repo_path"].as_str().unwrap_or(".");
                        McpTools::get_status(repo_path)
                    }
                    "gitbx_branches" => {
                        let repo_path = args["repo_path"].as_str().unwrap_or(".");
                        McpTools::get_branches(repo_path)
                    }
                    "gitbx_log" => {
                        let repo_path = args["repo_path"].as_str().unwrap_or(".");
                        let max_count = args["max_count"].as_u64().unwrap_or(50) as usize;
                        McpTools::get_log(repo_path, max_count)
                    }
                    "gitbx_tags" => {
                        let repo_path = args["repo_path"].as_str().unwrap_or(".");
                        McpTools::get_tags(repo_path)
                    }
                    "gitbx_diff" => {
                        let repo_path = args["repo_path"].as_str().unwrap_or(".");
                        let file_path = args["file_path"].as_str().unwrap_or("");
                        let staged = args["staged"].as_bool().unwrap_or(false);
                        McpTools::get_diff(repo_path, file_path, staged)
                    }
                    "gitbx_stage_file" => {
                        let repo_path = args["repo_path"].as_str().unwrap_or(".");
                        let file_path = args["file_path"].as_str().unwrap_or("");
                        McpTools::stage_file(repo_path, file_path)
                    }
                    "gitbx_stage_all" => {
                        let repo_path = args["repo_path"].as_str().unwrap_or(".");
                        McpTools::stage_all(repo_path)
                    }
                    "gitbx_create_branch" => {
                        let repo_path = args["repo_path"].as_str().unwrap_or(".");
                        let name = args["name"].as_str().unwrap_or("");
                        let checkout = args["checkout"].as_bool().unwrap_or(false);
                        McpTools::create_branch(repo_path, name, checkout)
                    }
                    "gitbx_merge" => McpTools::merge(
                        args["repo_path"].as_str().unwrap_or("."),
                        args["target"].as_str().unwrap_or(""),
                    ),
                    "gitbx_rebase" => McpTools::rebase(
                        args["repo_path"].as_str().unwrap_or("."),
                        args["upstream"].as_str().unwrap_or(""),
                    ),
                    "gitbx_cherry_pick" => McpTools::cherry_pick(
                        args["repo_path"].as_str().unwrap_or("."),
                        args["commit_id"].as_str().unwrap_or(""),
                    ),
                    "gitbx_reset" => McpTools::reset(
                        args["repo_path"].as_str().unwrap_or("."),
                        args["target"].as_str().unwrap_or("HEAD"),
                        args["mode"].as_str().unwrap_or("--mixed"),
                    ),
                    "gitbx_fetch" => McpTools::remote_operation(
                        args["repo_path"].as_str().unwrap_or("."),
                        "fetch",
                    ),
                    "gitbx_pull" => McpTools::remote_operation(
                        args["repo_path"].as_str().unwrap_or("."),
                        "pull",
                    ),
                    "gitbx_push" => McpTools::remote_operation(
                        args["repo_path"].as_str().unwrap_or("."),
                        "push",
                    ),
                    "gitbx_commit" => {
                        let repo_path = args["repo_path"].as_str().unwrap_or(".");
                        let msg = args["message"].as_str().unwrap_or("");
                        let author = args["author"].as_str().unwrap_or("GITBX AI");
                        let email = args["email"].as_str().unwrap_or("ai@gitbx.io");
                        McpTools::commit(repo_path, msg, author, email)
                    }
                    _ => Err(anyhow::anyhow!("Unknown tool: {}", tool_name)),
                };

                match res {
                    Ok(val) => JsonRpcResponse {
                        jsonrpc: "2.0".to_string(),
                        id: req.id,
                        result: Some(serde_json::json!({
                            "content": [{ "type": "text", "text": val.to_string() }]
                        })),
                        error: None,
                    },
                    Err(e) => JsonRpcResponse {
                        jsonrpc: "2.0".to_string(),
                        id: req.id,
                        result: None,
                        error: Some(
                            serde_json::json!({ "code": -32603, "message": e.to_string() }),
                        ),
                    },
                }
            }
            _ => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: req.id,
                result: None,
                error: Some(serde_json::json!({ "code": -32601, "message": "Method not found" })),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gitbx_contracts::{McpPermissionLevel, McpPolicyConfig, McpRepoRule};
    use std::fs;
    use tempfile::{tempdir, TempDir};

    fn request(method: &str, params: Option<Value>) -> JsonRpcRequest {
        JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(serde_json::json!(1)),
            method: method.to_string(),
            params,
        }
    }

    fn test_policy_engine(policy: &McpPolicyConfig) -> (TempDir, Mutex<PolicyEngine>) {
        let directory = tempdir().expect("create policy temp directory");
        let policy_path = directory.path().join("mcp-policy.json");
        fs::write(
            &policy_path,
            serde_json::to_vec(policy).expect("serialize test policy"),
        )
        .expect("write test policy");
        (
            directory,
            Mutex::new(PolicyEngine::with_custom_path(policy_path)),
        )
    }

    fn error_code(response: &JsonRpcResponse) -> i64 {
        response.error.as_ref().expect("expected error")["code"]
            .as_i64()
            .expect("numeric error code")
    }

    fn tool_text(response: &JsonRpcResponse) -> Value {
        assert!(
            response.error.is_none(),
            "unexpected tool error: {:?}",
            response.error
        );
        let text = response.result.as_ref().expect("tool result")["content"][0]["text"]
            .as_str()
            .expect("text tool result");
        serde_json::from_str(text).expect("JSON tool result text")
    }

    async fn call_tool(
        policy_engine: &Mutex<PolicyEngine>,
        name: &str,
        arguments: Value,
    ) -> JsonRpcResponse {
        McpServer::handle_request(
            request(
                "tools/call",
                Some(serde_json::json!({
                    "name": name,
                    "arguments": arguments
                })),
            ),
            policy_engine,
        )
        .await
    }

    #[tokio::test]
    async fn initialize_reports_package_version() {
        let (_policy_dir, policy_engine) = test_policy_engine(&McpPolicyConfig::default());

        let response = McpServer::handle_request(request("initialize", None), &policy_engine).await;

        assert!(response.error.is_none());
        assert_eq!(
            response.result.expect("initialize result")["serverInfo"]["version"],
            env!("CARGO_PKG_VERSION")
        );
    }

    #[tokio::test]
    async fn tools_list_strictly_filters_to_known_enabled_tools() {
        let policy = McpPolicyConfig {
            enabled_tools: vec![
                "gitbx_status".to_string(),
                "unknown_cached_tool".to_string(),
                "gitbx_status".to_string(),
            ],
            ..McpPolicyConfig::default()
        };
        let (_policy_dir, policy_engine) = test_policy_engine(&policy);

        let response = McpServer::handle_request(request("tools/list", None), &policy_engine).await;

        assert!(response.error.is_none());
        let names: Vec<String> = response.result.expect("tools/list result")["tools"]
            .as_array()
            .expect("tools array")
            .iter()
            .map(|tool| tool["name"].as_str().expect("tool name").to_string())
            .collect();
        assert_eq!(names, vec!["gitbx_status"]);
    }

    #[tokio::test]
    async fn cached_call_to_disabled_tool_is_rejected() {
        let policy = McpPolicyConfig {
            enabled_tools: Vec::new(),
            ..McpPolicyConfig::default()
        };
        let (_policy_dir, policy_engine) = test_policy_engine(&policy);

        let response = call_tool(
            &policy_engine,
            "gitbx_status",
            serde_json::json!({ "repo_path": "missing-repository" }),
        )
        .await;

        assert_eq!(error_code(&response), -32001);
        assert!(response.error.expect("policy error")["message"]
            .as_str()
            .expect("error message")
            .contains("disabled"));
    }

    #[tokio::test]
    async fn read_only_policy_rejects_write_tool_call() {
        let repo_path = "missing-repository";
        let policy = McpPolicyConfig {
            global_level: McpPermissionLevel::ReadOnly,
            allow_all_repos: true,
            allowed_repos: vec![McpRepoRule::new(repo_path)],
            enabled_tools: vec!["gitbx_stage_all".to_string()],
            ..McpPolicyConfig::default()
        };
        let (_policy_dir, policy_engine) = test_policy_engine(&policy);

        let response = call_tool(
            &policy_engine,
            "gitbx_stage_all",
            serde_json::json!({ "repo_path": repo_path }),
        )
        .await;

        assert_eq!(error_code(&response), -32001);
        assert!(response.error.expect("policy error")["message"]
            .as_str()
            .expect("error message")
            .contains("higher permission level"));
    }

    #[tokio::test]
    async fn safe_write_rejects_non_feature_branch_creation() {
        let repo_path = "managed-repository";
        let policy = McpPolicyConfig {
            global_level: McpPermissionLevel::SafeWrite,
            allow_all_repos: false,
            allowed_repos: vec![McpRepoRule::new(repo_path)],
            enabled_tools: vec!["gitbx_create_branch".to_string()],
            ..McpPolicyConfig::default()
        };
        let (_policy_dir, policy_engine) = test_policy_engine(&policy);

        let response = call_tool(
            &policy_engine,
            "gitbx_create_branch",
            serde_json::json!({
                "repo_path": repo_path,
                "name": "chore/not-allowed"
            }),
        )
        .await;

        assert_eq!(error_code(&response), -32001);
        assert!(response.error.expect("policy error")["message"]
            .as_str()
            .expect("error message")
            .contains("feature/* or fix/*"));
    }

    #[tokio::test]
    async fn unknown_method_returns_method_not_found() {
        let (_policy_dir, policy_engine) = test_policy_engine(&McpPolicyConfig::default());

        let response =
            McpServer::handle_request(request("gitbx/definitely-unknown", None), &policy_engine)
                .await;

        assert_eq!(error_code(&response), -32601);
        assert_eq!(
            response.error.expect("method error")["message"],
            "Method not found"
        );
    }

    #[tokio::test]
    async fn tool_calls_complete_status_stage_and_commit_flow() {
        let repository_dir = tempdir().expect("create repository temp directory");
        let repository = gitbx_core::init_repo(repository_dir.path(), false)
            .expect("initialize test repository");
        fs::write(repository_dir.path().join("README.md"), "base\n")
            .expect("write initial repository fixture");
        repository
            .stage_file("README.md")
            .expect("stage initial repository fixture");
        repository
            .create_commit("initial commit", "MCP Test", "mcp-test@example.com")
            .expect("create initial commit");
        repository
            .create_branch("feature/mcp-server-test", None)
            .expect("create feature branch");
        repository
            .checkout_branch("feature/mcp-server-test")
            .expect("select feature branch");
        drop(repository);

        fs::write(repository_dir.path().join("README.md"), "MCP test\n")
            .expect("write repository fixture");
        let repo_path = repository_dir.path().to_string_lossy().into_owned();
        let policy = McpPolicyConfig {
            global_level: McpPermissionLevel::SafeWrite,
            allow_all_repos: false,
            allowed_repos: vec![McpRepoRule::new(repo_path.clone())],
            enabled_tools: vec![
                "gitbx_status".to_string(),
                "gitbx_stage_file".to_string(),
                "gitbx_commit".to_string(),
            ],
            ..McpPolicyConfig::default()
        };
        let (_policy_dir, policy_engine) = test_policy_engine(&policy);

        let status = call_tool(
            &policy_engine,
            "gitbx_status",
            serde_json::json!({ "repo_path": repo_path }),
        )
        .await;
        assert_eq!(tool_text(&status)["total_changes"], 1);

        let stage = call_tool(
            &policy_engine,
            "gitbx_stage_file",
            serde_json::json!({
                "repo_path": repo_path,
                "file_path": "README.md"
            }),
        )
        .await;
        assert_eq!(tool_text(&stage)["success"], true);

        let commit = call_tool(
            &policy_engine,
            "gitbx_commit",
            serde_json::json!({
                "repo_path": repo_path,
                "message": "test: exercise MCP tool flow",
                "author": "MCP Test",
                "email": "mcp-test@example.com"
            }),
        )
        .await;
        let commit_result = tool_text(&commit);
        assert_eq!(commit_result["success"], true);
        assert!(commit_result["commit_id"].as_str().is_some());

        let repository = gitbx_core::open_repo(repository_dir.path()).expect("reopen repository");
        assert_eq!(
            repository.info().expect("repository info").head_branch,
            Some("feature/mcp-server-test".to_string())
        );
        assert_eq!(
            repository
                .get_status()
                .expect("repository status")
                .total_changes,
            0
        );
    }
}
