use serde::{Deserialize, Serialize};
use similar::{ChangeTag, TextDiff};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiffAlgorithm {
    Myers,
    Patience,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiffLineType {
    Context,
    Addition,
    Deletion,
    HunkHeader,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub line_type: DiffLineType,
    pub old_lineno: Option<usize>,
    pub new_lineno: Option<usize>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    pub header: String,
    pub old_start: usize,
    pub old_lines: usize,
    pub new_start: usize,
    pub new_lines: usize,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub is_binary: bool,
    pub hunks: Vec<DiffHunk>,
    pub additions: usize,
    pub deletions: usize,
}

pub struct DiffEngine;

impl DiffEngine {
    pub fn diff_strings(old_text: &str, new_text: &str, old_path: Option<&str>, new_path: Option<&str>) -> FileDiff {
        let diff = TextDiff::from_lines(old_text, new_text);
        let mut hunks = Vec::new();
        let mut total_additions = 0;
        let mut total_deletions = 0;

        for group in diff.grouped_ops(3) {
            let mut lines = Vec::new();
            let mut old_start = 0;
            let mut old_count = 0;
            let mut new_start = 0;
            let mut new_count = 0;

            for (idx, op) in group.iter().enumerate() {
                if idx == 0 {
                    old_start = op.old_range().start + 1;
                    new_start = op.new_range().start + 1;
                }
                old_count += op.old_range().len();
                new_count += op.new_range().len();

                for change in diff.iter_changes(op) {
                    let (line_type, old_no, new_no) = match change.tag() {
                        ChangeTag::Equal => (DiffLineType::Context, change.old_index().map(|i| i + 1), change.new_index().map(|i| i + 1)),
                        ChangeTag::Delete => {
                            total_deletions += 1;
                            (DiffLineType::Deletion, change.old_index().map(|i| i + 1), None)
                        }
                        ChangeTag::Insert => {
                            total_additions += 1;
                            (DiffLineType::Addition, None, change.new_index().map(|i| i + 1))
                        }
                    };

                    lines.push(DiffLine {
                        line_type,
                        old_lineno: old_no,
                        new_lineno: new_no,
                        content: change.value().trim_end_matches(&['\r', '\n'][..]).to_string(),
                    });
                }
            }

            let header = format!("@@ -{},{} +{},{} @@", old_start, old_count, new_start, new_count);
            hunks.push(DiffHunk {
                header,
                old_start,
                old_lines: old_count,
                new_start,
                new_lines: new_count,
                lines,
            });
        }

        FileDiff {
            old_path: old_path.map(|s| s.to_string()),
            new_path: new_path.map(|s| s.to_string()),
            is_binary: false,
            hunks,
            additions: total_additions,
            deletions: total_deletions,
        }
    }
}
