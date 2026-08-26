pub mod commit_gen;
pub mod conflict_analyzer;
pub mod provider;
pub mod secret_scanner;

pub(crate) fn language_name(language: Option<&str>) -> &'static str {
    match language.map(str::trim) {
        Some("ja") => "Japanese",
        Some("de") => "German",
        Some("es") => "Spanish",
        Some("zh-CN") => "Simplified Chinese",
        Some("zh-TW") => "Traditional Chinese",
        Some("fr") => "French",
        Some("ar") => "Arabic",
        _ => "English",
    }
}

pub use commit_gen::{CommitGenerator, GeneratedCommitMessage};
pub use conflict_analyzer::{ConflictAnalyzer, ConflictResolutionSuggestion};
pub use provider::{GenericOpenAiClient, LlmClient, LlmConfig};
pub use secret_scanner::{SecretDetection, SecretScanner};
