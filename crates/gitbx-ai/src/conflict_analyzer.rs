use crate::provider::LlmClient;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictResolutionSuggestion {
    pub explanation: String,
    pub suggested_content: String,
}

pub struct ConflictAnalyzer;

impl ConflictAnalyzer {
    pub async fn analyze_conflict(
        client: &dyn LlmClient,
        file_path: &str,
        ours: &str,
        theirs: &str,
        base: Option<&str>,
    ) -> anyhow::Result<ConflictResolutionSuggestion> {
        let system_prompt = "You are a Git merge conflict resolution expert. Analyze both sides of the conflict and provide the cleanest merged resolution with explanation. \
        Output format in JSON with keys 'explanation' and 'suggested_content'.";

        let user_prompt = format!(
            "File: {}\n\n=== BASE ===\n{}\n\n=== OURS (Current Branch) ===\n{}\n\n=== THEIRS (Incoming Branch) ===\n{}\n",
            file_path,
            base.unwrap_or("<none>"),
            ours,
            theirs
        );

        let response = client.chat_completion(system_prompt, &user_prompt).await?;
        
        // Attempt parsing JSON
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&response) {
            let explanation = val["explanation"].as_str().unwrap_or("AI Merge suggestion").to_string();
            let suggested_content = val["suggested_content"].as_str().unwrap_or(&ours).to_string();
            return Ok(ConflictResolutionSuggestion {
                explanation,
                suggested_content,
            });
        }

        Ok(ConflictResolutionSuggestion {
            explanation: "Auto merged suggestion from AI".to_string(),
            suggested_content: response,
        })
    }
}
