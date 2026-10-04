use crate::tools::McpTools;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, BufRead, Write};

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
                        Self::handle_request(req).await
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

    async fn handle_request(req: JsonRpcRequest) -> JsonRpcResponse {
        match req.method.as_str() {
            "initialize" => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: req.id,
                result: Some(serde_json::json!({
                    "protocolVersion": "2024-11-05",
                    "serverInfo": {
                        "name": "gitbx-mcp",
                        "version": "0.1.25"
                    },
                    "capabilities": {
                        "tools": {}
                    }
                })),
                error: None,
            },
            "tools/list" => {
                let enabled_tools: Vec<String> = {
                    let mut policy = crate::policy::global_policy()
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());
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
                    let mut policy = crate::policy::global_policy()
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());
                    policy.authorize_tool_call(tool_name, repo_path_opt)
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
                    "gitbx_list_repos" => McpTools::list_repos(),
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
