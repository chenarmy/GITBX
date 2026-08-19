pub mod algorithm;
pub mod merge3;

pub use algorithm::{DiffAlgorithm, DiffEngine, DiffHunk, DiffLine, DiffLineType, FileDiff};
pub use merge3::{ConflictChunk, ConflictSectionType, Merge3Engine};
