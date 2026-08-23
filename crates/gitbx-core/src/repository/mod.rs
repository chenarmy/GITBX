use crate::error::{GitbxError, Result};
use git2::Repository as Git2Repo;
use serde::{Deserialize, Serialize};
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
            .and_then(|h| h.shorthand().map(|s| s.to_string()));

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

        Ok(RepositoryInfo {
            name,
            path: self.path.to_string_lossy().to_string(),
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
        })
    }

    pub fn get_commits(&self, max_count: usize) -> Result<Vec<CommitDetail>> {
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
                short_id: commit.as_object().short_id()?.as_str().unwrap_or("").to_string(),
                parent_ids,
                author_name: author.name().unwrap_or("").to_string(),
                author_email: author.email().unwrap_or("").to_string(),
                author_time: author.when().seconds(),
                committer_name: committer.name().unwrap_or("").to_string(),
                committer_email: committer.email().unwrap_or("").to_string(),
                committer_time: committer.when().seconds(),
                summary: commit.summary().unwrap_or("").to_string(),
                body: commit.body().map(|s| s.to_string()),
                branch_refs: Vec::new(),
                tag_refs: Vec::new(),
            });
        }

        Ok(commits)
    }
}
