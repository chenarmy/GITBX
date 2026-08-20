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
        let lines: Vec<&str> = content.lines().collect();

        let mut in_conflict = false;
        let mut in_theirs = false;
        let mut in_base = false;

        let mut normal_buf = Vec::new();
        let mut ours_buf = Vec::new();
        let mut theirs_buf = Vec::new();
        let mut base_buf = Vec::new();

        for line in lines {
            if line.starts_with("<<<<<<<") {
                if !normal_buf.is_empty() {
                    chunks.push(ConflictChunk {
                        section_type: ConflictSectionType::Normal,
                        resolved_content: Some(normal_buf.join("\n")),
                    });
                    normal_buf.clear();
                }
                in_conflict = true;
                in_theirs = false;
                in_base = false;
                ours_buf.clear();
                theirs_buf.clear();
                base_buf.clear();
            } else if line.starts_with("|||||||") && in_conflict {
                in_base = true;
            } else if line.starts_with("=======") && in_conflict {
                in_theirs = true;
                in_base = false;
            } else if line.starts_with(">>>>>>>") && in_conflict {
                chunks.push(ConflictChunk {
                    section_type: ConflictSectionType::Conflict {
                        ours: ours_buf.join("\n"),
                        theirs: theirs_buf.join("\n"),
                        base: if base_buf.is_empty() {
                            None
                        } else {
                            Some(base_buf.join("\n"))
                        },
                    },
                    resolved_content: None,
                });
                in_conflict = false;
                in_theirs = false;
                in_base = false;
                ours_buf.clear();
                theirs_buf.clear();
                base_buf.clear();
            } else if in_conflict {
                if in_base {
                    base_buf.push(line);
                } else if in_theirs {
                    theirs_buf.push(line);
                } else {
                    ours_buf.push(line);
                }
            } else {
                normal_buf.push(line);
            }
        }

        if !normal_buf.is_empty() {
            chunks.push(ConflictChunk {
                section_type: ConflictSectionType::Normal,
                resolved_content: Some(normal_buf.join("\n")),
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
                assert_eq!(ours, "a");
                assert_eq!(theirs, "c");
                assert_eq!(base.as_deref(), Some("b"));
            }
            _ => panic!("expected conflict"),
        }
    }
}
