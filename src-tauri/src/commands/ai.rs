use gitbx_ai::{
    CommitGenerator, ConflictAnalyzer, ConflictResolutionSuggestion, GeneratedCommitMessage,
    GenericOpenAiClient, LlmConfig, SecretDetection, SecretScanner,
};
use gitbx_core::KeyringManager;

fn resolve_config(mut config: LlmConfig) -> LlmConfig {
    if config
        .api_key
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .is_empty()
    {
        if let Ok(key) = KeyringManager::get_token(&config.provider, "default") {
            config.api_key = Some(key);
        }
    }
    config
}

#[tauri::command]
pub async fn generate_commit_message(
    diff_text: String,
    config: LlmConfig,
    language: String,
) -> Result<GeneratedCommitMessage, String> {
    let resolved = resolve_config(config);
    let client = GenericOpenAiClient::new(resolved);
    CommitGenerator::generate_from_diff(&client, &diff_text, Some(&language))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn scan_secrets(diff_text: String) -> Result<Vec<SecretDetection>, String> {
    let scanner = SecretScanner::new();
    Ok(scanner.scan_diff(&diff_text))
}

#[tauri::command]
pub async fn analyze_conflict(
    file_path: String,
    ours: String,
    theirs: String,
    base: Option<String>,
    config: LlmConfig,
    language: String,
) -> Result<ConflictResolutionSuggestion, String> {
    let resolved = resolve_config(config);
    let client = GenericOpenAiClient::new(resolved);
    ConflictAnalyzer::analyze_conflict(
        &client,
        &file_path,
        &ours,
        &theirs,
        base.as_deref(),
        Some(&language),
    )
    .await
    .map_err(|e| e.to_string())
}
