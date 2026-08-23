pub mod algorithm;
pub mod conflict;
pub mod merge3;

pub use algorithm::{DiffAlgorithm, DiffEngine, DiffHunk, DiffLine, DiffLineType, FileDiff};
pub use conflict::{load_conflict_file, resolve_conflict_file, ConflictFileContent};
pub use merge3::{ConflictChunk, ConflictSectionType, Merge3Engine};
