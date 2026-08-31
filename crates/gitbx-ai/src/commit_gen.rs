use crate::provider::LlmClient;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedCommitMessage {
    pub commit_type: String,
    pub scope: Option<String>,
    pub summary: String,
    pub body: Option<String>,
    pub raw_full_message: String,
}

pub struct CommitGenerator;

impl CommitGenerator {
    pub async fn generate_from_diff(
        client: &dyn LlmClient,
        diff_text: &str,
        language: Option<&str>,
    ) -> anyhow::Result<GeneratedCommitMessage> {
        if diff_text.trim().is_empty() {
            anyhow::bail!("No diff is available for commit message generation");
        }

        let system_prompt = format!(
            "You are an expert Git commit assistant. Generate a concise Conventional Commit message based on the provided diff. \
            The format must be: `<type>(<scope>): <summary>` followed by an optional body. \
            Valid types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. \
            Keep the Conventional Commit type keywords and syntax unchanged. Write the summary and optional body in {}. \
            Return only the formatted commit message without markdown code block formatting.",
            crate::language_name(language)
        );

        let user_prompt = format!("Diff changes:\n\n{}", diff_text);
        let raw = client.chat_completion(&system_prompt, &user_prompt).await?;

        // Parse first line
        let first_line = raw.lines().next().unwrap_or(&raw);
        let commit_type = if first_line.contains(':') {
            first_line
                .split(':')
                .next()
                .unwrap_or("chore")
                .trim()
                .to_string()
        } else {
            "chore".to_string()
        };

        Ok(GeneratedCommitMessage {
            commit_type,
            scope: None,
            summary: first_line.to_string(),
            body: if raw.lines().count() > 1 {
                Some(raw.clone())
            } else {
                None
            },
            raw_full_message: raw,
        })
    }
}
