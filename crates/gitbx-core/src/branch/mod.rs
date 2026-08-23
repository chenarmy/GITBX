use crate::error::Result;
use crate::repository::Repository;
use git2::BranchType;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchItem {
    pub name: String,
    pub is_head: bool,
    pub is_remote: bool,
    pub target_commit_id: String,
    pub upstream_name: Option<String>,
    pub ahead_count: usize,
    pub behind_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagItem {
    pub name: String,
    pub target_commit_id: String,
    pub message: Option<String>,
    pub tagger_name: Option<String>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StashItem {
    pub index: usize,
    pub message: String,
    pub commit_id: String,
}

fn sort_tags_by_recency(tags: &mut [TagItem]) {
    tags.sort_by(|left, right| {
        right
            .timestamp
            .cmp(&left.timestamp)
            .then_with(|| right.name.cmp(&left.name))
    });
}

impl Repository {
    pub fn list_branches(&self, branch_type: Option<BranchType>) -> Result<Vec<BranchItem>> {
        let branches = self.inner().branches(branch_type)?;
        let mut list = Vec::new();

        for item in branches {
            let (branch, b_type) = item?;
            let name = branch.name()?.unwrap_or("").to_string();
            let is_head = branch.is_head();
            let is_remote = b_type == BranchType::Remote;
            let target_commit_id = branch.get().peel_to_commit()?.id().to_string();

            let upstream = branch.upstream().ok();
            let upstream_name = upstream
                .as_ref()
                .and_then(|u| u.name().ok().flatten().map(|s| s.to_string()));

            let mut ahead = 0;
            let mut behind = 0;

            if let Some(ref up) = upstream {
                if let (Ok(local_oid), Ok(up_oid)) =
                    (branch.get().target().ok_or(()), up.get().target().ok_or(()))
                {
                    if let Ok((a, b)) = self.inner().graph_ahead_behind(local_oid, up_oid) {
                        ahead = a;
                        behind = b;
                    }
                }
            }

            list.push(BranchItem {
                name,
                is_head,
                is_remote,
                target_commit_id,
                upstream_name,
                ahead_count: ahead,
                behind_count: behind,
            });
        }

        Ok(list)
    }

    pub fn create_branch(&self, name: &str, target_commit_id: Option<&str>) -> Result<()> {
        let commit = if let Some(oid_str) = target_commit_id {
            let oid = git2::Oid::from_str(oid_str)?;
            self.inner().find_commit(oid)?
        } else {
            self.inner().head()?.peel_to_commit()?
        };

        self.inner().branch(name, &commit, false)?;
        Ok(())
    }

    pub fn delete_branch(&self, name: &str, is_remote: bool) -> Result<()> {
        let b_type = if is_remote {
            BranchType::Remote
        } else {
            BranchType::Local
        };
        let mut branch = self.inner().find_branch(name, b_type)?;
        branch.delete()?;
        Ok(())
    }

    pub fn checkout_branch(&self, name: &str) -> Result<()> {
        let (object, reference) = self.inner().revparse_ext(name)?;
        self.inner().checkout_tree(&object, None)?;

        if let Some(ref r) = reference {
            if r.is_branch() {
                self.inner().set_head(r.name().unwrap_or(name))?;
            } else {
                self.inner().set_head_detached(object.id())?;
            }
        } else {
            self.inner().set_head_detached(object.id())?;
        }

        Ok(())
    }

    pub fn list_tags(&self) -> Result<Vec<TagItem>> {
        let tag_names = self.inner().tag_names(None)?;
        let mut tags = Vec::new();

        for name in tag_names.iter().flatten() {
            if let Ok(obj) = self.inner().revparse_single(&format!("refs/tags/{}", name)) {
                let commit = obj.peel_to_commit()?;
                let commit_id = commit.id().to_string();
                let tag_obj = obj.as_tag();
                let timestamp = tag_obj
                    .and_then(|tag| tag.tagger().map(|signature| signature.when().seconds()))
                    .unwrap_or_else(|| commit.time().seconds());

                tags.push(TagItem {
                    name: name.to_string(),
                    target_commit_id: commit_id,
                    message: tag_obj.and_then(|t| t.message().map(|m| m.to_string())),
                    tagger_name: tag_obj
                        .and_then(|t| t.tagger().and_then(|sig| sig.name().map(|n| n.to_string()))),
                    timestamp,
                });
            }
        }

        sort_tags_by_recency(&mut tags);

        Ok(tags)
    }

    pub fn list_stashes(&mut self) -> Result<Vec<StashItem>> {
        let mut stashes = Vec::new();
        self.inner_mut().stash_foreach(|index, message, oid| {
            stashes.push(StashItem {
                index,
                message: message.to_string(),
                commit_id: oid.to_string(),
            });
            true
        })?;
        Ok(stashes)
    }
}

#[cfg(test)]
mod tests {
    use super::{sort_tags_by_recency, TagItem};

    fn tag(name: &str, timestamp: i64) -> TagItem {
        TagItem {
            name: name.to_string(),
            target_commit_id: String::new(),
            message: None,
            tagger_name: None,
            timestamp,
        }
    }

    #[test]
    fn sorts_tags_by_timestamp_descending() {
        let mut tags = vec![tag("v0.1.2", 200), tag("v0.1.1", 100), tag("v0.1.3", 300)];

        sort_tags_by_recency(&mut tags);

        assert_eq!(
            tags.iter()
                .map(|item| item.name.as_str())
                .collect::<Vec<_>>(),
            vec!["v0.1.3", "v0.1.2", "v0.1.1"]
        );
    }
}
