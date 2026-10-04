use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub context_length: Option<u32>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmConfig {
    pub provider: String, // "openai", "claude", "deepseek", "ollama", "openrouter", "qwen", "kimi", "custom"
    pub api_base: String,
    #[serde(skip_serializing)]
    pub api_key: Option<String>,
    pub model: String,
    pub temperature: Option<f32>,
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            api_base: "https://api.openai.com/v1".to_string(),
            api_key: None,
            model: "gpt-4o-mini".to_string(),
            temperature: Some(0.3),
        }
    }
}

pub async fn list_models(config: &LlmConfig) -> anyhow::Result<Vec<ModelInfo>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    let base = config.api_base.trim_end_matches('/');

    // 1. CLI Agents without external HTTP base
    if (config.provider.contains("cli") || config.provider.contains("agent")) && base.is_empty() {
        let models = match config.provider.as_str() {
            "claude-code-cli" => vec!["claude-3-7-sonnet", "claude-3-5-sonnet"],
            "cursor-cli" => vec!["cursor-agent", "claude-3.5-sonnet", "gpt-4o"],
            "codex-cli" => vec!["gpt-4o", "o1-mini", "codex-davinci"],
            "opencode-cli" => vec!["opencode-default", "deepseek-coder"],
            "codebuddy-code" => vec!["codebuddy-v1", "hunyuan-code"],
            "qoder-cli" => vec!["qoder-default", "qwen2.5-coder"],
            "grok-cli" => vec!["grok-2", "grok-beta"],
            "pi-coding-agent" => vec!["pi-agent-v1", "pi-fast"],
            _ => vec!["default-agent-model"],
        };
        return Ok(models
            .into_iter()
            .map(|m| ModelInfo {
                id: m.to_string(),
                name: m.to_string(),
                context_length: Some(128000),
                description: Some(format!("Local CLI Agent Model ({})", config.provider)),
            })
            .collect());
    }

    // 2. Ollama Native Endpoint
    if config.provider.eq_ignore_ascii_case("ollama") {
        let tags_url = format!("{base}/api/tags");
        if let Ok(res) = client.get(&tags_url).send().await {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                if let Some(arr) = json["models"].as_array() {
                    let mut list = Vec::new();
                    for item in arr {
                        if let Some(name) = item["name"].as_str() {
                            list.push(ModelInfo {
                                id: name.to_string(),
                                name: name.to_string(),
                                context_length: None,
                                description: None,
                            });
                        }
                    }
                    if !list.is_empty() {
                        return Ok(list);
                    }
                }
            }
        }
    }

    // 3. Anthropic Claude & Anthropic Compatible Protocol
    if config.provider.eq_ignore_ascii_case("claude")
        || config.provider.eq_ignore_ascii_case("anthropic-compatible")
    {
        let url = format!("{base}/models");
        let mut req = client.get(&url).header("anthropic-version", "2023-06-01");
        if let Some(ref key) = config.api_key {
            req = req.header("x-api-key", key);
        }
        if let Ok(res) = req.send().await {
            if res.status().is_success() {
                if let Ok(json) = res.json::<serde_json::Value>().await {
                    let mut list = Vec::new();
                    if let Some(arr) = json["data"].as_array() {
                        for item in arr {
                            if let Some(id) = item["id"].as_str() {
                                let name = item["display_name"].as_str().unwrap_or(id).to_string();
                                list.push(ModelInfo {
                                    id: id.to_string(),
                                    name,
                                    context_length: None,
                                    description: None,
                                });
                            }
                        }
                    }
                    if !list.is_empty() {
                        return Ok(list);
                    }
                }
            }
        }
        return Ok(vec![
            ModelInfo { id: "claude-3-5-sonnet-latest".into(), name: "Claude 3.5 Sonnet".into(), context_length: Some(200000), description: None },
            ModelInfo { id: "claude-3-7-sonnet-latest".into(), name: "Claude 3.7 Sonnet".into(), context_length: Some(200000), description: None },
            ModelInfo { id: "claude-3-haiku-20240307".into(), name: "Claude 3 Haiku".into(), context_length: Some(200000), description: None },
        ]);
    }

    // 4. OpenAI and OpenAI-Compatible Providers
    let url = if base.ends_with("/models") {
        base.to_string()
    } else {
        format!("{base}/models")
    };
    let mut req = client.get(&url);
    if let Some(ref key) = config.api_key {
        req = req.header("Authorization", format!("Bearer {}", key));
    }
    match req.send().await {
        Ok(res) if res.status().is_success() => {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                let mut list = Vec::new();
                if let Some(arr) = json["data"].as_array().or_else(|| json["models"].as_array()) {
                    for item in arr {
                        if let Some(id) = item["id"].as_str().or_else(|| item["name"].as_str()) {
                            let name = item["name"].as_str().unwrap_or(id).to_string();
                            let context_length = item["context_length"].as_u64().map(|v| v as u32);
                            let description = item["description"].as_str().map(String::from);
                            list.push(ModelInfo {
                                id: id.to_string(),
                                name,
                                context_length,
                                description,
                            });
                        }
                    }
                }
                if !list.is_empty() {
                    return Ok(list);
                }
            }
        }
        _ => {}
    }

    // Provider-specific fallback if network or key not set
    let fallback = match config.provider.to_lowercase().as_str() {
        "gemini" => vec!["gemini-2.0-flash", "gemini-2.0-pro-exp-02-05", "gemini-1.5-pro", "gemini-1.5-flash"],
        "deepseek" => vec!["deepseek-chat", "deepseek-reasoner"],
        "kimi" => vec!["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
        "qwen" => vec!["qwen-plus", "qwen-turbo", "qwen-max", "qwen2.5-coder-32b-instruct"],
        "zhipu" => vec!["glm-4-flash", "glm-4-plus", "glm-4-long", "codegeex-4"],
        "minimax" => vec!["MiniMax-Text-01", "abab6.5s-chat"],
        _ => vec!["gpt-4o-mini", "gpt-4o", "o1-mini"],
    };

    Ok(fallback
        .into_iter()
        .map(|m| ModelInfo {
            id: m.to_string(),
            name: m.to_string(),
            context_length: Some(128000),
            description: None,
        })
        .collect())
}

#[async_trait]
pub trait LlmClient: Send + Sync {
    async fn chat_completion(
        &self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> anyhow::Result<String>;

    async fn chat_with_messages(
        &self,
        messages: &[serde_json::Value],
        tools: Option<&[serde_json::Value]>,
    ) -> anyhow::Result<serde_json::Value>;
}

pub struct GenericOpenAiClient {
    config: LlmConfig,
    client: reqwest::Client,
}

impl GenericOpenAiClient {
    pub fn new(config: LlmConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl LlmClient for GenericOpenAiClient {
    async fn chat_completion(
        &self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> anyhow::Result<String> {
        let messages = vec![
            serde_json::json!({ "role": "system", "content": system_prompt }),
            serde_json::json!({ "role": "user", "content": user_prompt }),
        ];
        let res = self.chat_with_messages(&messages, None).await?;
        if let Some(content) = res["content"].as_str() {
            Ok(content.trim().to_string())
        } else {
            Err(anyhow::anyhow!("Empty completion response: {:?}", res))
        }
    }

    async fn chat_with_messages(
        &self,
        messages: &[serde_json::Value],
        tools: Option<&[serde_json::Value]>,
    ) -> anyhow::Result<serde_json::Value> {
        let base = self.config.api_base.trim_end_matches('/');

        // CLI Agent without remote API base
        if (self.config.provider.contains("cli") || self.config.provider.contains("agent")) && base.is_empty() {
            let tool = match self.config.provider.as_str() {
                "claude-code-cli" => "claude",
                "cursor-cli" => "cursor",
                "codex-cli" => "codex",
                "opencode-cli" => "opencode",
                "codebuddy-code" => "codebuddy",
                "qoder-cli" => "qoder",
                "grok-cli" => "grok",
                "pi-coding-agent" => "pi",
                _ => "cli-agent",
            };
            return Ok(serde_json::json!({
                "content": format!(
                    "🤖 **本地 CLI 智能体代理模式**\n\n已连接至 `{}` (模型: `{}`)\n\n如需直接通过终端与该智能体对话或执行任务，请在控制台或系统终端运行：\n```bash\n{} --help\n```\n提示：您也可以在设置中为该提供商配置 OpenAI / Claude 兼容代理端点与密钥进行直接 API 调用。",
                    self.config.provider,
                    self.config.model,
                    tool
                ),
                "tool_calls": serde_json::Value::Null
            }));
        }

        if self.config.provider.eq_ignore_ascii_case("claude")
            || self.config.provider.eq_ignore_ascii_case("anthropic-compatible")
        {
            let url = format!("{base}/messages");
            let mut req = self
                .client
                .post(url)
                .header("anthropic-version", "2023-06-01");
            if let Some(ref key) = self.config.api_key {
                req = req.header("x-api-key", key);
            }

            // Extract system prompt if present in messages
            let mut system = String::new();
            let mut anthropic_msgs = Vec::new();
            for m in messages {
                if m["role"].as_str() == Some("system") {
                    if let Some(s) = m["content"].as_str() {
                        system.push_str(s);
                        system.push('\n');
                    }
                } else {
                    anthropic_msgs.push(m.clone());
                }
            }

            let mut body = serde_json::json!({
                "model": self.config.model,
                "max_tokens": 4096,
                "temperature": self.config.temperature.unwrap_or(0.3),
                "messages": anthropic_msgs
            });
            if !system.is_empty() {
                body["system"] = serde_json::Value::String(system.trim().to_string());
            }
            if let Some(t) = tools {
                let mut anthropic_tools = Vec::new();
                for tool in t {
                    if let Some(f) = tool.get("function") {
                        anthropic_tools.push(serde_json::json!({
                            "name": f.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                            "description": f.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                            "input_schema": f.get("parameters").cloned().unwrap_or(serde_json::json!({"type": "object", "properties": {}}))
                        }));
                    } else {
                        anthropic_tools.push(tool.clone());
                    }
                }
                body["tools"] = serde_json::json!(anthropic_tools);
            }

            let json: serde_json::Value = req
                .json(&body)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;

            let mut content_text = String::new();
            let mut tool_calls = Vec::new();
            if let Some(blocks) = json["content"].as_array() {
                for b in blocks {
                    if b["type"] == "text" {
                        if let Some(text) = b["text"].as_str() {
                            content_text.push_str(text);
                        }
                    } else if b["type"] == "tool_use" {
                        tool_calls.push(serde_json::json!({
                            "id": b["id"],
                            "type": "function",
                            "function": {
                                "name": b["name"],
                                "arguments": b["input"].to_string()
                            }
                        }));
                    }
                }
            }
            let tc_value = if tool_calls.is_empty() { serde_json::Value::Null } else { serde_json::json!(tool_calls) };
            return Ok(serde_json::json!({
                "content": content_text,
                "tool_calls": tc_value,
                "choices": [
                    {
                        "message": {
                            "content": content_text,
                            "tool_calls": tc_value
                        }
                    }
                ]
            }));
        }

        let url = format!("{base}/chat/completions");
        let mut req = self.client.post(url);
        if let Some(ref key) = self.config.api_key {
            req = req.header("Authorization", format!("Bearer {}", key));
        }
        let mut body = serde_json::json!({
            "model": self.config.model,
            "temperature": self.config.temperature.unwrap_or(0.3),
            "messages": messages
        });
        if let Some(t) = tools {
            body["tools"] = serde_json::json!(t);
            body["tool_choice"] = serde_json::json!("auto");
        }

        let json: serde_json::Value = req
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        let choice = &json["choices"][0]["message"];
        let content = choice["content"].as_str().unwrap_or("").to_string();
        let tool_calls = choice.get("tool_calls").cloned().unwrap_or(serde_json::Value::Null);

        Ok(serde_json::json!({
            "content": content,
            "tool_calls": tool_calls,
            "choices": [
                {
                    "message": {
                        "content": content,
                        "tool_calls": tool_calls
                    }
                }
            ]
        }))
    }
}

