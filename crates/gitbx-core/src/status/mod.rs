use crate::error::{GitbxError, Result};
use crate::repository::Repository;
use git2::{IndexAddOption, StatusOptions};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FileDeltaStatus {
    Unmodified,
    Added,
    Deleted,
    Modified,
    Renamed,
    Typechange,
    Conflicted,
    Untracked,
    Ignored,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileStatusItem {
    pub path: String,
    pub old_path: Option<String>,
    pub staged_status: FileDeltaStatus,
    pub unstaged_status: FileDeltaStatus,
    pub is_staged: bool,
    pub is_conflicted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoStatusSummary {
    pub staged_files: Vec<FileStatusItem>,
    pub unstaged_files: Vec<FileStatusItem>,
    pub untracked_files: Vec<FileStatusItem>,
    pub conflicted_files: Vec<FileStatusItem>,
    pub total_changes: usize,
}

impl Repository {
    pub fn get_status(&self) -> Result<RepoStatusSummary> {
        let mut opts = StatusOptions::new();
        opts.include_untracked(true)
            .recurse_untracked_dirs(true)
            .renames_head_to_index(true)
            .renames_index_to_workdir(true);

        let statuses = self.inner().statuses(Some(&mut opts))?;

        let mut staged = Vec::new();
        let mut unstaged = Vec::new();
        let mut untracked = Vec::new();
        let mut conflicted = Vec::new();

        for entry in statuses.iter() {
            let status = entry.status();
            let path = entry.path().unwrap_or("").to_string();

            let mut item = FileStatusItem {
                path: path.clone(),
                old_path: entry.head_to_index().and_then(|d| d.old_file().path().map(|p| p.to_string_lossy().to_string())),
                staged_status: FileDeltaStatus::Unmodified,
                unstaged_status: FileDeltaStatus::Unmodified,
                is_staged: false,
                is_conflicted: status.is_conflicted(),
            };

            // Staged (Index) status
            if status.is_index_new() {
                item.staged_status = FileDeltaStatus::Added;
                item.is_staged = true;
            } else if status.is_index_modified() {
                item.staged_status = FileDeltaStatus::Modified;
                item.is_staged = true;
            } else if status.is_index_deleted() {
                item.staged_status = FileDeltaStatus::Deleted;
                item.is_staged = true;
            } else if status.is_index_renamed() {
                item.staged_status = FileDeltaStatus::Renamed;
                item.is_staged = true;
            } else if status.is_index_typechange() {
                item.staged_status = FileDeltaStatus::Typechange;
                item.is_staged = true;
            }

            // Workdir (Unstaged) status
            if status.is_wt_new() {
                item.unstaged_status = FileDeltaStatus::Untracked;
            } else if status.is_wt_modified() {
                item.unstaged_status = FileDeltaStatus::Modified;
            } else if status.is_wt_deleted() {
                item.unstaged_status = FileDeltaStatus::Deleted;
            } else if status.is_wt_renamed() {
                item.unstaged_status = FileDeltaStatus::Renamed;
            } else if status.is_wt_typechange() {
                item.unstaged_status = FileDeltaStatus::Typechange;
            }

            if status.is_conflicted() {
                item.staged_status = FileDeltaStatus::Conflicted;
                item.unstaged_status = FileDeltaStatus::Conflicted;
                conflicted.push(item.clone());
            }

            if item.is_staged {
                staged.push(item.clone());
            }

            if status.is_wt_new() {
                untracked.push(item.clone());
            } else if item.unstaged_status != FileDeltaStatus::Unmodified {
                unstaged.push(item);
            }
        }

        let total = staged.len() + unstaged.len() + untracked.len() + conflicted.len();

        Ok(RepoStatusSummary {
            staged_files: staged,
            unstaged_files: unstaged,
            untracked_files: untracked,
            conflicted_files: conflicted,
            total_changes: total,
        })
    }

    pub fn stage_file(&self, path: &str) -> Result<()> {
        let mut index = self.inner().index()?;
        let full_path = self.path().join(path);
        if full_path.exists() {
            index.add_path(Path::new(path))?;
        } else {
            index.remove_path(Path::new(path))?;
        }
        index.write()?;
        Ok(())
    }

    pub fn unstage_file(&self, path: &str) -> Result<()> {
        let head = self.inner().head()?.peel_to_commit()?;
        let head_tree = head.tree()?;
        let mut index = self.inner().index()?;

        if let Ok(entry) = head_tree.get_path(Path::new(path)) {
            index.add_frombuffer(
                &git2::IndexEntry {
                    ctime: git2::IndexTime::new(0, 0),
                    mtime: git2::IndexTime::new(0, 0),
                    dev: 0,
                    ino: 0,
                    mode: entry.filemode() as u32,
                    uid: 0,
                    gid: 0,
                    file_size: 0,
                    id: entry.id(),
                    flags: 0,
                    flags_extended: 0,
                    path: path.as_bytes().to_vec(),
                },
                &[],
            )?;
        } else {
            index.remove_path(Path::new(path))?;
        }
        index.write()?;
        Ok(())
    }

    pub fn stage_all(&self) -> Result<()> {
        let mut index = self.inner().index()?;
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
        index.update_all(["*"].iter(), None)?;
        index.write()?;
        Ok(())
    }

    pub fn create_commit(&self, message: &str, author_name: &str, author_email: &str) -> Result<String> {
        let mut index = self.inner().index()?;
        let tree_oid = index.write_tree()?;
        let tree = self.inner().find_tree(tree_oid)?;

        let sig = git2::Signature::now(author_name, author_email)?;
        let parent_commit = self.inner().head().ok().and_then(|h| h.peel_to_commit().ok());

        let parents: Vec<&git2::Commit> = parent_commit.as_ref().map(|c| vec![c]).unwrap_or_default();

        let commit_oid = self.inner().commit(
            Some("HEAD"),
            &sig,
            &sig,
            message,
            &tree,
            &parents,
        )?;

        Ok(commit_oid.to_string())
    }
}
