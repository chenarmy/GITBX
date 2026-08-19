use crate::tools::McpTools;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, BufRead, Write};

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
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
            if line.trim().is_empty() {
                continue;
            }

            if let Ok(req) = serde_json::from_str::<JsonRpcRequest>(&line) {
                let resp = Self::handle_request(req).await;
                let out = serde_json::to_string(&resp)?;
                writeln!(stdout, "{}", out)?;
                stdout.flush()?;
            }
        }

        Ok(())
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
                        "version": "0.1.0"
                    },
                    "capabilities": {
                        "tools": {}
                    }
                })),
                error: None,
            },
            "tools/list" => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: req.id,
                result: Some(serde_json::json!({
                    "tools": [
                        {
                            "name": "gitbx_status",
                            "description": "Get status of the Git repository",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "repo_path": { "type": "string" }
                                },
                                "required": ["repo_path"]
                            }
                        },
                        {
                            "name": "gitbx_branches",
                            "description": "List all branches",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "repo_path": { "type": "string" }
                                },
                                "required": ["repo_path"]
                            }
                        },
                        {
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
                        },
                        {
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
                        }
                    ]
                })),
                error: None,
            },
            "tools/call" => {
                let params = req.params.unwrap_or(Value::Null);
                let tool_name = params["name"].as_str().unwrap_or("");
                let args = &params["arguments"];

                let res = match tool_name {
                    "gitbx_status" => {
                        let repo_path = args["repo_path"].as_str().unwrap_or(".");
                        McpTools::get_status(repo_path)
                    }
                    "gitbx_branches" => {
                        let repo_path = args["repo_path"].as_str().unwrap_or(".");
                        McpTools::get_branches(repo_path)
                    }
                    "gitbx_stage_file" => {
                        let repo_path = args["repo_path"].as_str().unwrap_or(".");
                        let file_path = args["file_path"].as_str().unwrap_or("");
                        McpTools::stage_file(repo_path, file_path)
                    }
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
                        error: Some(serde_json::json!({ "code": -32603, "message": e.to_string() })),
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
