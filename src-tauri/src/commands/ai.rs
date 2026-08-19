use gitbx_ai::{
    CommitGenerator, ConflictAnalyzer, ConflictResolutionSuggestion, GeneratedCommitMessage,
    GenericOpenAiClient, LlmConfig, SecretDetection, SecretScanner,
};

#[tauri::command]
pub async fn generate_commit_message(
    diff_text: String,
    config: LlmConfig,
) -> Result<GeneratedCommitMessage, String> {
    let client = GenericOpenAiClient::new(config);
    CommitGenerator::generate_from_diff(&client, &diff_text)
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
) -> Result<ConflictResolutionSuggestion, String> {
    let client = GenericOpenAiClient::new(config);
    ConflictAnalyzer::analyze_conflict(&client, &file_path, &ours, &theirs, base.as_deref())
        .await
        .map_err(|e| e.to_string())
}
