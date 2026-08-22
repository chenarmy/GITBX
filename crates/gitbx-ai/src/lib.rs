pub mod commit_gen;
pub mod conflict_analyzer;
pub mod provider;
pub mod secret_scanner;

pub use commit_gen::{CommitGenerator, GeneratedCommitMessage};
pub use conflict_analyzer::{ConflictAnalyzer, ConflictResolutionSuggestion};
pub use provider::{GenericOpenAiClient, LlmConfig, LlmClient};
pub use secret_scanner::{SecretDetection, SecretScanner};
