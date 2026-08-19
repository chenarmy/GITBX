use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmConfig {
    pub provider: String, // "openai", "claude", "deepseek", "ollama", "custom"
    pub api_base: String,
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

#[async_trait]
pub trait LlmClient: Send + Sync {
    async fn chat_completion(&self, system_prompt: &str, user_prompt: &str) -> anyhow::Result<String>;
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
    async fn chat_completion(&self, system_prompt: &str, user_prompt: &str) -> anyhow::Result<String> {
        let url = format!("{}/chat/completions", self.config.api_base.trim_end_matches('/'));
        let mut req = self.client.post(&url);

        if let Some(ref key) = self.config.api_key {
            req = req.header("Authorization", format!("Bearer {}", key));
        }

        let body = serde_json::json!({
            "model": self.config.model,
            "temperature": self.config.temperature.unwrap_or(0.3),
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_prompt }
            ]
        });

        let res = req.json(&body).send().await?;
        let json: serde_json::Value = res.json().await?;

        if let Some(content) = json["choices"][0]["message"]["content"].as_str() {
            Ok(content.trim().to_string())
        } else {
            Err(anyhow::anyhow!("Invalid response from LLM API: {:?}", json))
        }
    }
}
