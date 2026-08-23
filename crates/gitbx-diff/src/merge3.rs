use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConflictSectionType {
    Normal,
    Conflict {
        ours: String,
        theirs: String,
        base: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictChunk {
    pub section_type: ConflictSectionType,
    pub resolved_content: Option<String>,
}

pub struct Merge3Engine;

impl Merge3Engine {
    pub fn parse_conflicted_file(content: &str) -> Vec<ConflictChunk> {
        let mut chunks = Vec::new();
        let mut in_conflict = false;
        let mut in_theirs = false;
        let mut in_base = false;
        let mut normal_buf = String::new();
        let mut ours_buf = String::new();
        let mut theirs_buf = String::new();
        let mut base_buf = String::new();
        let mut raw_conflict = String::new();

        for line in content.split_inclusive('\n') {
            let marker_line = line.trim_end_matches(['\r', '\n']);
            if marker_line.starts_with("<<<<<<<") && !in_conflict {
                if !normal_buf.is_empty() {
                    chunks.push(ConflictChunk {
                        section_type: ConflictSectionType::Normal,
                        resolved_content: Some(std::mem::take(&mut normal_buf)),
                    });
                }
                in_conflict = true;
                in_theirs = false;
                in_base = false;
                raw_conflict.push_str(line);
            } else if marker_line.starts_with("|||||||") && in_conflict {
                in_base = true;
                raw_conflict.push_str(line);
            } else if marker_line.starts_with("=======") && in_conflict {
                in_theirs = true;
                in_base = false;
                raw_conflict.push_str(line);
            } else if marker_line.starts_with(">>>>>>>") && in_conflict {
                raw_conflict.push_str(line);
                chunks.push(ConflictChunk {
                    section_type: ConflictSectionType::Conflict {
                        ours: std::mem::take(&mut ours_buf),
                        theirs: std::mem::take(&mut theirs_buf),
                        base: if base_buf.is_empty() {
                            None
                        } else {
                            Some(std::mem::take(&mut base_buf))
                        },
                    },
                    resolved_content: None,
                });
                in_conflict = false;
                in_theirs = false;
                in_base = false;
                raw_conflict.clear();
            } else if in_conflict {
                raw_conflict.push_str(line);
                if in_base {
                    base_buf.push_str(line);
                } else if in_theirs {
                    theirs_buf.push_str(line);
                } else {
                    ours_buf.push_str(line);
                }
            } else {
                normal_buf.push_str(line);
            }
        }

        if in_conflict {
            normal_buf.push_str(&raw_conflict);
        }

        if !normal_buf.is_empty() {
            chunks.push(ConflictChunk {
                section_type: ConflictSectionType::Normal,
                resolved_content: Some(normal_buf),
            });
        }

        chunks
    }
}

#[cfg(test)]
mod tests {
    use super::{ConflictSectionType, Merge3Engine};

    #[test]
    fn parses_diff3_conflict_markers() {
        let chunks = Merge3Engine::parse_conflicted_file(
            "before\n<<<<<<< ours\na\n||||||| base\nb\n=======\nc\n>>>>>>> theirs\nafter\n",
        );
        assert_eq!(chunks.len(), 3);
        match &chunks[1].section_type {
            ConflictSectionType::Conflict { ours, theirs, base } => {
                assert_eq!(ours, "a\n");
                assert_eq!(theirs, "c\n");
                assert_eq!(base.as_deref(), Some("b\n"));
            }
            _ => panic!("expected conflict"),
        }
    }

    #[test]
    fn preserves_content_and_trailing_newline() {
        let content = "before\n<<<<<<< ours\na\n=======\nb\n>>>>>>> theirs\nafter\n";
        let chunks = Merge3Engine::parse_conflicted_file(content);
        let rebuilt = chunks
            .iter()
            .map(|chunk| match &chunk.section_type {
                ConflictSectionType::Normal => chunk.resolved_content.as_deref().unwrap_or(""),
                ConflictSectionType::Conflict { ours, .. } => ours.as_str(),
            })
            .collect::<String>();
        assert_eq!(rebuilt, "before\na\nafter\n");
    }
}
