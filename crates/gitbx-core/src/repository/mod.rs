use crate::error::{GitbxError, Result};
use crate::path_for_display;
use git2::Repository as Git2Repo;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryInfo {
    pub name: String,
    pub path: String,
    pub is_bare: bool,
    pub head_branch: Option<String>,
    pub head_commit_id: Option<String>,
    pub is_dirty: bool,
    pub remotes: Vec<String>,
    pub is_merging: bool,
    pub is_rebasing: bool,
    pub is_cherry_picking: bool,
    pub is_reverting: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitDetail {
    pub id: String,
    pub short_id: String,
    pub parent_ids: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub author_time: i64,
    pub committer_name: String,
    pub committer_email: String,
    pub committer_time: i64,
    pub summary: String,
    pub body: Option<String>,
    pub branch_refs: Vec<String>,
    pub tag_refs: Vec<String>,
}

pub struct Repository {
    inner: Git2Repo,
    path: PathBuf,
}

impl Repository {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path_buf = path.as_ref().to_path_buf();
        let inner = Git2Repo::open(&path_buf)
            .map_err(|_| GitbxError::RepoNotFound(path_buf.to_string_lossy().to_string()))?;
        Ok(Self {
            inner,
            path: path_buf,
        })
    }

    pub fn init<P: AsRef<Path>>(path: P, bare: bool) -> Result<Self> {
        let path_buf = path.as_ref().to_path_buf();
        let inner = if bare {
            Git2Repo::init_bare(&path_buf)?
        } else {
            Git2Repo::init(&path_buf)?
        };
        Ok(Self {
            inner,
            path: path_buf,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn inner(&self) -> &Git2Repo {
        &self.inner
    }

    pub fn inner_mut(&mut self) -> &mut Git2Repo {
        &mut self.inner
    }

    pub fn workdir_file(&self, relative_path: &str) -> Result<Vec<u8>> {
        let workdir = self.inner.workdir().ok_or_else(|| {
            GitbxError::General("Bare repositories do not have a working tree".into())
        })?;
        Ok(fs::read(workdir.join(relative_path))?)
    }

    pub fn index_file(&self, relative_path: &str) -> Result<Vec<u8>> {
        let index = self.inner.index()?;
        let entry = index.get_path(Path::new(relative_path), 0).ok_or_else(|| {
            GitbxError::General(format!("File is not present in the index: {relative_path}"))
        })?;
        let blob = self.inner.find_blob(entry.id)?;
        Ok(blob.content().to_vec())
    }

    pub fn commit_file(&self, commit_id: &str, relative_path: &str) -> Result<Vec<u8>> {
        let commit = self.inner.find_commit(git2::Oid::from_str(commit_id)?)?;
        let entry = commit.tree()?.get_path(Path::new(relative_path))?;
        let blob = self.inner.find_blob(entry.id())?;
        Ok(blob.content().to_vec())
    }

    pub fn info(&self) -> Result<RepositoryInfo> {
        let name = self
            .path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string());

        let head_branch = self
            .inner
            .head()
            .ok()
            .and_then(|h| h.shorthand().map(|s| s.to_string()))
            .or_else(|| {
                self.inner
                    .find_reference("HEAD")
                    .ok()
                    .and_then(|head| head.symbolic_target().map(str::to_string))
                    .and_then(|target| target.strip_prefix("refs/heads/").map(str::to_string))
            });

        let head_commit_id = self
            .inner
            .head()
            .ok()
            .and_then(|h| h.target().map(|oid| oid.to_string()));

        let remotes = self
            .inner
            .remotes()
            .map(|r| r.iter().filter_map(|s| s.map(|x| x.to_string())).collect())
            .unwrap_or_default();

        let is_dirty = self
            .inner
            .statuses(None)
            .map(|s| !s.is_empty())
            .unwrap_or(false);

        let state = self.inner.state();

        let is_reverting = matches!(
            state,
            git2::RepositoryState::Revert | git2::RepositoryState::RevertSequence
        );

        Ok(RepositoryInfo {
            name,
            path: path_for_display(&self.path),
            is_bare: self.inner.is_bare(),
            head_branch,
            head_commit_id,
            is_dirty,
            remotes,
            is_merging: state == git2::RepositoryState::Merge,
            is_rebasing: matches!(
                state,
                git2::RepositoryState::Rebase
                    | git2::RepositoryState::RebaseInteractive
                    | git2::RepositoryState::RebaseMerge
                    | git2::RepositoryState::ApplyMailboxOrRebase
            ),
            is_cherry_picking: matches!(
                state,
                git2::RepositoryState::CherryPick | git2::RepositoryState::CherryPickSequence
            ),
            is_reverting,
        })
    }

    pub fn get_commits(&self, max_count: usize) -> Result<Vec<CommitDetail>> {
        if let Err(error) = self.inner.head() {
            let has_unborn_target = self
                .inner
                .find_reference("HEAD")
                .ok()
                .and_then(|head| head.symbolic_target().map(str::to_string))
                .is_some_and(|target| self.inner.find_reference(&target).is_err());
            if has_unborn_target {
                return Ok(Vec::new());
            }
            return Err(error.into());
        }

        let mut branch_map: std::collections::HashMap<git2::Oid, Vec<String>> =
            std::collections::HashMap::new();
        if let Ok(branches) = self.inner.branches(None) {
            for item in branches.flatten() {
                let is_remote = item.1 == git2::BranchType::Remote;
                let name = item.0.name().ok().flatten().unwrap_or("").to_string();
                if name.is_empty() || (is_remote && (name == "HEAD" || name.ends_with("/HEAD"))) {
                    continue;
                }
                if let Ok(target) = item.0.get().peel_to_commit() {
                    branch_map.entry(target.id()).or_default().push(name);
                }
            }
        }

        let mut tag_map: std::collections::HashMap<git2::Oid, Vec<String>> =
            std::collections::HashMap::new();
        if let Ok(tags) = self.inner.tag_names(None) {
            for name in tags.iter().flatten() {
                if let Ok(obj) = self.inner.revparse_single(&format!("refs/tags/{}", name)) {
                    if let Ok(commit) = obj.peel_to_commit() {
                        tag_map
                            .entry(commit.id())
                            .or_default()
                            .push(name.to_string());
                    }
                }
            }
        }

        let mut revwalk = self.inner.revwalk()?;
        revwalk.push_head()?;
        revwalk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)?;

        let mut commits = Vec::new();
        for oid_res in revwalk.take(max_count) {
            let oid = oid_res?;
            let commit = self.inner.find_commit(oid)?;

            let parent_ids = commit.parent_ids().map(|id| id.to_string()).collect();
            let author = commit.author();
            let committer = commit.committer();

            commits.push(CommitDetail {
                id: commit.id().to_string(),
                short_id: commit
                    .as_object()
                    .short_id()?
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
                parent_ids,
                author_name: author.name().unwrap_or("").to_string(),
                author_email: author.email().unwrap_or("").to_string(),
                author_time: author.when().seconds(),
                committer_name: committer.name().unwrap_or("").to_string(),
                committer_email: committer.email().unwrap_or("").to_string(),
                committer_time: committer.when().seconds(),
                summary: commit.summary().unwrap_or("").to_string(),
                body: commit.body().map(|s| s.to_string()),
                branch_refs: branch_map.get(&commit.id()).cloned().unwrap_or_default(),
                tag_refs: tag_map.get(&commit.id()).cloned().unwrap_or_default(),
            });
        }

        Ok(commits)
    }

    pub fn get_commit_changes(
        &self,
        commit_id: &str,
    ) -> Result<Vec<crate::status::FileStatusItem>> {
        let commit = self.inner.find_commit(git2::Oid::from_str(commit_id)?)?;
        let tree = commit.tree()?;
        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
        let mut diff_opts = git2::DiffOptions::new();
        let diff = self.inner.diff_tree_to_tree(
            parent_tree.as_ref(),
            Some(&tree),
            Some(&mut diff_opts),
        )?;

        let mut items = Vec::new();
        for delta in diff.deltas() {
            let old_file = delta.old_file();
            let new_file = delta.new_file();
            let path = new_file
                .path()
                .or_else(|| old_file.path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let old_path = old_file.path().map(|p| p.to_string_lossy().to_string());
            let status = match delta.status() {
                git2::Delta::Added => crate::status::FileDeltaStatus::Added,
                git2::Delta::Deleted => crate::status::FileDeltaStatus::Deleted,
                git2::Delta::Modified => crate::status::FileDeltaStatus::Modified,
                git2::Delta::Renamed => crate::status::FileDeltaStatus::Renamed,
                git2::Delta::Typechange => crate::status::FileDeltaStatus::Typechange,
                _ => crate::status::FileDeltaStatus::Modified,
            };
            items.push(crate::status::FileStatusItem {
                path,
                old_path,
                staged_status: status,
                unstaged_status: crate::status::FileDeltaStatus::Unmodified,
                is_staged: true,
                is_conflicted: false,
            });
        }
        Ok(items)
    }
}

#[cfg(test)]
mod tests {
    use super::Repository;
    use tempfile::tempdir;

    #[test]
    fn empty_repository_reports_branch_and_empty_history() {
        let dir = tempdir().expect("tempdir");
        let repo = Repository::init(dir.path(), false).expect("init repository");
        repo.inner()
            .set_head("refs/heads/main")
            .expect("set unborn branch");

        let info = repo.info().expect("repository info");
        assert_eq!(info.head_branch.as_deref(), Some("main"));
        assert!(info.head_commit_id.is_none());
        assert!(repo.get_commits(100).expect("empty history").is_empty());
    }
}
