use crate::{open_repo, GitbxError, Repository, RepositoryInfo, Result};
use git2::{BranchType, ObjectType, ResetType};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

static REPO_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();

fn repo_locks() -> &'static Mutex<HashMap<PathBuf, Arc<Mutex<()>>>> {
    REPO_LOCKS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub struct GitService;

impl GitService {
    fn ensure_no_operation(repo: &Repository, action: &str) -> Result<()> {
        if repo.inner().state() != git2::RepositoryState::Clean {
            return Err(GitbxError::General(format!(
                "Finish or abort the current Git operation before {action}"
            )));
        }
        Ok(())
    }

    fn ensure_clean_worktree(repo: &Repository, operation: &str) -> Result<()> {
        if repo.info()?.is_dirty {
            return Err(GitbxError::General(format!(
                "Commit, stash, or discard local changes before starting {operation}"
            )));
        }
        Ok(())
    }

    pub fn contains_conflict_markers(content: &str) -> bool {
        let mut saw_start = false;
        let mut saw_separator = false;
        for line in content.lines() {
            if line.starts_with("<<<<<<<") {
                saw_start = true;
                saw_separator = false;
            } else if saw_start && line.starts_with("=======") {
                saw_separator = true;
            } else if saw_start && saw_separator && line.starts_with(">>>>>>>") {
                return true;
            }
        }
        false
    }

    fn ensure_index_has_no_conflict_markers(repo: &Repository) -> Result<()> {
        let index = repo.inner().index()?;
        for entry in index.iter() {
            let Ok(blob) = repo.inner().find_blob(entry.id) else {
                continue;
            };
            if blob.size() > 2 * 1024 * 1024 {
                continue;
            }
            let Ok(content) = std::str::from_utf8(blob.content()) else {
                continue;
            };
            if Self::contains_conflict_markers(content) {
                return Err(GitbxError::MergeConflict(format!(
                    "File '{}' still contains unresolved conflict markers",
                    String::from_utf8_lossy(&entry.path)
                )));
            }
        }
        Ok(())
    }

    pub fn canonical_repo_path(path: &str) -> Result<PathBuf> {
        let input = Path::new(path);
        let canonical = input
            .canonicalize()
            .map_err(|_| GitbxError::RepoNotFound(path.to_string()))?;
        if !canonical.is_dir() {
            return Err(GitbxError::RepoNotFound(path.to_string()));
        }
        Ok(canonical)
    }

    pub fn open(path: &str) -> Result<Repository> {
        let canonical = Self::canonical_repo_path(path)?;
        open_repo(canonical)
    }

    pub fn info(path: &str) -> Result<RepositoryInfo> {
        Self::open(path)?.info()
    }

    pub fn with_write_lock<T>(
        path: &str,
        f: impl FnOnce(&mut Repository) -> Result<T>,
    ) -> Result<T> {
        let canonical = Self::canonical_repo_path(path)?;
        let lock = {
            let mut locks = repo_locks()
                .lock()
                .map_err(|_| GitbxError::General("Repository lock poisoned".into()))?;
            locks
                .entry(canonical.clone())
                .or_insert_with(|| Arc::new(Mutex::new(())))
                .clone()
        };
        let _guard = lock
            .lock()
            .map_err(|_| GitbxError::General("Repository lock poisoned".into()))?;
        let mut repo = open_repo(canonical)?;
        f(&mut repo)
    }

    pub fn validate_file_path(repo_path: &str, file_path: &str) -> Result<PathBuf> {
        let repo_root = Self::canonical_repo_path(repo_path)?;
        let relative = Path::new(file_path);
        if relative.is_absolute()
            || relative
                .components()
                .any(|c| matches!(c, std::path::Component::ParentDir))
        {
            return Err(GitbxError::General(
                "File path must stay inside the repository".into(),
            ));
        }
        let candidate = repo_root.join(relative);
        let normalized = if candidate.exists() {
            candidate.canonicalize()?
        } else {
            candidate
        };
        if !normalized.starts_with(&repo_root) {
            return Err(GitbxError::General(
                "File path must stay inside the repository".into(),
            ));
        }
        Ok(normalized)
    }

    pub fn clone_repo(url: &str, destination: &str) -> Result<RepositoryInfo> {
        let dest_path = Path::new(destination);
        let mut fetch_options = git2::FetchOptions::new();
        fetch_options.remote_callbacks(crate::remote::authenticated_remote_callbacks(
            git2::Config::open_default().ok(),
        ));
        fetch_options.proxy_options(crate::proxy_options());
        let mut builder = git2::build::RepoBuilder::new();
        builder.fetch_options(fetch_options);
        builder.clone(url, dest_path)?;
        Self::info(destination)
    }

    pub fn create_branch(
        path: &str,
        name: &str,
        target: Option<&str>,
        checkout: bool,
    ) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            repo.create_branch(name, target)?;
            if checkout {
                repo.checkout_branch(name)?;
            }
            Ok(())
        })
    }

    pub fn delete_branch(path: &str, name: &str, _force: bool) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            let mut branch = repo.inner().find_branch(name, BranchType::Local)?;
            if branch.is_head() {
                return Err(GitbxError::General(
                    "Cannot delete the currently checked out branch".into(),
                ));
            }
            branch.delete()?;
            Ok(())
        })
    }

    pub fn rename_branch(path: &str, old_name: &str, new_name: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            let mut branch = repo.inner().find_branch(old_name, BranchType::Local)?;
            branch.rename(new_name, false)?;
            Ok(())
        })
    }

    pub fn create_tag(
        path: &str,
        name: &str,
        message: Option<&str>,
        commit_id: Option<&str>,
    ) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            let object = match commit_id {
                Some(id) => repo.inner().revparse_single(id)?,
                None => repo.inner().head()?.peel(ObjectType::Commit)?,
            };
            let signature = repo
                .inner()
                .signature()
                .or_else(|_| git2::Signature::now("GITBX", "gitbx@localhost"))?;
            if let Some(message) = message {
                repo.inner()
                    .tag(name, &object, &signature, message, false)?;
            } else {
                repo.inner().tag_lightweight(name, &object, false)?;
            }
            Ok(())
        })
    }

    pub fn create_stash(path: &str, message: Option<&str>) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            let signature = repo
                .inner()
                .signature()
                .or_else(|_| git2::Signature::now("GITBX", "gitbx@localhost"))?;
            repo.inner_mut()
                .stash_save(&signature, message.unwrap_or("GITBX stash"), None)?;
            Ok(())
        })
    }

    pub fn pop_stash(path: &str, index: usize) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            let mut opts = git2::StashApplyOptions::new();
            repo.inner_mut().stash_apply(index, Some(&mut opts))?;
            repo.inner_mut().stash_drop(index)?;
            Ok(())
        })
    }

    pub fn discard_file(path: &str, file_path: Option<&str>) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            Self::ensure_no_operation(repo, "discarding changes")?;
            if let Some(file_path) = file_path {
                let validated = Self::validate_file_path(path, file_path)?;
                let head_tree = repo.inner().head().ok().and_then(|h| h.peel_to_tree().ok());
                let is_tracked_in_head = head_tree
                    .as_ref()
                    .is_some_and(|t| t.get_path(Path::new(file_path)).is_ok());
                let is_tracked_in_index = repo
                    .inner()
                    .index()
                    .ok()
                    .is_some_and(|idx| idx.get_path(Path::new(file_path), 0).is_some());

                if !is_tracked_in_head && !is_tracked_in_index {
                    if validated.is_dir() {
                        let _ = std::fs::remove_dir_all(&validated);
                    } else if validated.exists() {
                        let _ = std::fs::remove_file(&validated);
                    }
                    return Ok(());
                }

                let mut checkout = git2::build::CheckoutBuilder::new();
                checkout.path(file_path).force();
                repo.inner().checkout_head(Some(&mut checkout))?;
            } else {
                let mut checkout = git2::build::CheckoutBuilder::new();
                checkout.force();
                repo.inner().checkout_head(Some(&mut checkout))?;
            }
            Ok(())
        })
    }

    pub fn reset(path: &str, target: &str, mode: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            Self::ensure_no_operation(repo, "resetting the repository")?;
            let object = repo.inner().revparse_single(target)?;
            let reset_type = match mode {
                "--soft" => ResetType::Soft,
                "--hard" => ResetType::Hard,
                _ => ResetType::Mixed,
            };
            repo.inner().reset(&object, reset_type, None)?;
            Ok(())
        })
    }

    pub fn merge(path: &str, target: &str, no_ff: bool) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            Self::ensure_clean_worktree(repo, "a merge")?;
            let annotated = repo
                .inner()
                .find_annotated_commit(repo.inner().revparse_single(target)?.id())?;
            let (analysis, _) = repo.inner().merge_analysis(&[&annotated])?;
            if analysis.is_up_to_date() {
                return Ok(());
            }
            if analysis.is_fast_forward() && !no_ff {
                let reference = repo.inner().head()?.name().unwrap_or("HEAD").to_string();
                let mut reference = repo.inner().find_reference(&reference)?;
                reference.set_target(annotated.id(), "GITBX fast-forward merge")?;
                repo.inner().checkout_head(None)?;
                return Ok(());
            }
            let mut options = git2::MergeOptions::new();
            let mut checkout = git2::build::CheckoutBuilder::new();
            checkout.conflict_style_diff3(true);
            repo.inner()
                .merge(&[&annotated], Some(&mut options), Some(&mut checkout))?;
            if repo.inner().index()?.has_conflicts() {
                return Err(GitbxError::MergeConflict("Merge produced conflicts".into()));
            }
            let tree_id = repo.inner().index()?.write_tree()?;
            let tree = repo.inner().find_tree(tree_id)?;
            let head = repo.inner().head()?.peel_to_commit()?;
            let theirs = repo.inner().find_commit(annotated.id())?;
            let signature = repo
                .inner()
                .signature()
                .or_else(|_| git2::Signature::now("GITBX", "gitbx@localhost"))?;
            repo.inner().commit(
                Some("HEAD"),
                &signature,
                &signature,
                "Merge commit",
                &tree,
                &[&head, &theirs],
            )?;
            drop(theirs);
            drop(head);
            drop(tree);
            drop(annotated);
            repo.inner_mut().cleanup_state()?;
            repo.inner().checkout_head(None)?;
            Ok(())
        })
    }

    pub fn cherry_pick(path: &str, commit_id: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            Self::ensure_clean_worktree(repo, "a cherry-pick")?;
            let commit = repo.inner().find_commit(git2::Oid::from_str(commit_id)?)?;
            repo.inner().cherrypick(&commit, None)?;
            if repo.inner().index()?.has_conflicts() {
                return Err(GitbxError::MergeConflict(
                    "Cherry-pick produced conflicts".into(),
                ));
            }
            let tree_id = repo.inner().index()?.write_tree()?;
            let tree = repo.inner().find_tree(tree_id)?;
            let head = repo.inner().head()?.peel_to_commit()?;
            let signature = repo
                .inner()
                .signature()
                .or_else(|_| git2::Signature::now("GITBX", "gitbx@localhost"))?;
            let message = commit.message().unwrap_or("Cherry-pick commit").to_string();
            repo.inner().commit(
                Some("HEAD"),
                &signature,
                &signature,
                &message,
                &tree,
                &[&head],
            )?;
            drop(head);
            drop(tree);
            drop(commit);
            repo.inner_mut().cleanup_state()?;
            repo.inner().checkout_head(None)?;
            Ok(())
        })
    }

    pub fn revert(path: &str, commit_id: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            Self::ensure_clean_worktree(repo, "a revert")?;
            let commit = repo.inner().find_commit(git2::Oid::from_str(commit_id)?)?;
            repo.inner().revert(&commit, None)?;
            if repo.inner().index()?.has_conflicts() {
                return Err(GitbxError::MergeConflict(
                    "Revert produced conflicts".into(),
                ));
            }
            let tree_id = repo.inner().index()?.write_tree()?;
            let tree = repo.inner().find_tree(tree_id)?;
            let head = repo.inner().head()?.peel_to_commit()?;
            let signature = repo
                .inner()
                .signature()
                .or_else(|_| git2::Signature::now("GITBX", "gitbx@localhost"))?;
            let summary = commit.summary().unwrap_or("commit");
            let message = format!(
                "Revert \"{}\"\n\nThis reverts commit {}.",
                summary, commit_id
            );
            repo.inner().commit(
                Some("HEAD"),
                &signature,
                &signature,
                &message,
                &tree,
                &[&head],
            )?;
            drop(head);
            drop(tree);
            drop(commit);
            repo.inner_mut().cleanup_state()?;
            repo.inner().checkout_head(None)?;
            Ok(())
        })
    }

    pub fn fetch_all(path: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| repo.fetch_all())
    }

    pub fn set_remote_urls(
        path: &str,
        name: &str,
        url: &str,
        push_url: Option<&str>,
    ) -> Result<()> {
        Self::with_write_lock(path, |repo| repo.set_remote_urls(name, url, push_url))
    }

    pub fn push(path: &str, remote: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| repo.push_current(remote))
    }

    pub fn pull(path: &str, remote: &str) -> Result<()> {
        Self::fetch_all(path)?;
        let target = Self::with_write_lock(path, |repo| {
            let branch_name = repo
                .inner()
                .head()?
                .shorthand()
                .ok_or_else(|| GitbxError::General("HEAD is detached".into()))?
                .to_string();
            let branch = repo.inner().find_branch(&branch_name, BranchType::Local)?;
            if let Ok(upstream) = branch.upstream() {
                if let Some(name) = upstream.name()? {
                    return Ok(name
                        .strip_prefix("refs/remotes/")
                        .unwrap_or(name)
                        .to_string());
                }
            }
            Ok(format!("{remote}/{branch_name}"))
        })?;
        Self::merge(path, &target, false)
    }

    pub fn rebase(path: &str, upstream: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            Self::ensure_clean_worktree(repo, "a rebase")?;
            let object = repo.inner().revparse_single(upstream)?;
            let annotated = repo.inner().find_annotated_commit(object.id())?;
            let mut rebase = repo.inner().rebase(None, Some(&annotated), None, None)?;
            let signature = repo
                .inner()
                .signature()
                .or_else(|_| git2::Signature::now("GITBX", "gitbx@localhost"))?;
            while let Some(operation) = rebase.next() {
                let _operation = operation?;
                if repo.inner().index()?.has_conflicts() {
                    return Err(GitbxError::MergeConflict(
                        "Rebase produced conflicts".into(),
                    ));
                }
                rebase.commit(None, &signature, None)?;
            }
            rebase.finish(Some(&signature))?;
            repo.inner().checkout_head(None)?;
            Ok(())
        })
    }

    pub fn abort_merge(path: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            if repo.inner().state() != git2::RepositoryState::Merge {
                return Err(GitbxError::General(
                    "No merge operation is in progress".into(),
                ));
            }
            let head = repo.inner().head()?.peel_to_commit()?;
            repo.inner()
                .reset(head.as_object(), ResetType::Hard, None)?;
            drop(head);
            repo.inner_mut().cleanup_state()?;
            Ok(())
        })
    }

    pub fn abort_operation(path: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| match repo.inner().state() {
            git2::RepositoryState::Rebase
            | git2::RepositoryState::RebaseInteractive
            | git2::RepositoryState::RebaseMerge
            | git2::RepositoryState::ApplyMailboxOrRebase => {
                let mut rebase = repo.inner().open_rebase(None)?;
                rebase.abort()?;
                Ok(())
            }
            git2::RepositoryState::CherryPick
            | git2::RepositoryState::CherryPickSequence
            | git2::RepositoryState::Revert
            | git2::RepositoryState::RevertSequence => {
                let head = repo.inner().head()?.peel_to_commit()?;
                repo.inner()
                    .reset(head.as_object(), ResetType::Hard, None)?;
                drop(head);
                repo.inner_mut().cleanup_state()?;
                Ok(())
            }
            git2::RepositoryState::Merge => {
                let head = repo.inner().head()?.peel_to_commit()?;
                repo.inner()
                    .reset(head.as_object(), ResetType::Hard, None)?;
                drop(head);
                repo.inner_mut().cleanup_state()?;
                Ok(())
            }
            _ => Err(GitbxError::General(
                "No abortable Git operation is in progress".into(),
            )),
        })
    }

    pub fn continue_merge(path: &str) -> Result<String> {
        Self::with_write_lock(path, |repo| {
            if repo.inner().index()?.has_conflicts() {
                return Err(GitbxError::MergeConflict(
                    "Resolve all conflicts before continuing the merge".into(),
                ));
            }
            Self::ensure_index_has_no_conflict_markers(repo)?;
            let merge_head = repo
                .inner()
                .find_reference("MERGE_HEAD")?
                .target()
                .ok_or_else(|| GitbxError::General("No merge operation is in progress".into()))?;
            let theirs = repo.inner().find_commit(merge_head)?;
            let head = repo.inner().head()?.peel_to_commit()?;
            let tree_id = repo.inner().index()?.write_tree()?;
            let tree = repo.inner().find_tree(tree_id)?;
            let signature = repo
                .inner()
                .signature()
                .or_else(|_| git2::Signature::now("GITBX", "gitbx@localhost"))?;
            let message = repo
                .inner()
                .message()
                .ok()
                .unwrap_or_else(|| "Merge commit".to_string());
            let id = repo.inner().commit(
                Some("HEAD"),
                &signature,
                &signature,
                &message,
                &tree,
                &[&head, &theirs],
            )?;
            drop(theirs);
            drop(head);
            drop(tree);
            repo.inner_mut().cleanup_state()?;
            repo.inner().checkout_head(None)?;
            Ok(id.to_string())
        })
    }

    pub fn continue_rebase(path: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            if repo.inner().index()?.has_conflicts() {
                return Err(GitbxError::MergeConflict(
                    "Resolve all conflicts before continuing the rebase".into(),
                ));
            }
            Self::ensure_index_has_no_conflict_markers(repo)?;
            let mut rebase = repo.inner().open_rebase(None)?;
            let signature = repo
                .inner()
                .signature()
                .or_else(|_| git2::Signature::now("GITBX", "gitbx@localhost"))?;
            rebase.commit(None, &signature, None)?;
            while let Some(operation) = rebase.next() {
                operation?;
                if repo.inner().index()?.has_conflicts() {
                    return Err(GitbxError::MergeConflict(
                        "Resolve all conflicts before continuing the rebase".into(),
                    ));
                }
                rebase.commit(None, &signature, None)?;
            }
            rebase.finish(Some(&signature))?;
            repo.inner().checkout_head(None)?;
            Ok(())
        })
    }

    pub fn continue_cherry_pick(path: &str) -> Result<String> {
        Self::with_write_lock(path, |repo| {
            if repo.inner().index()?.has_conflicts() {
                return Err(GitbxError::MergeConflict(
                    "Resolve all conflicts before continuing the cherry-pick".into(),
                ));
            }
            Self::ensure_index_has_no_conflict_markers(repo)?;
            let pick_id = repo
                .inner()
                .find_reference("CHERRY_PICK_HEAD")?
                .target()
                .ok_or_else(|| {
                    GitbxError::General("No cherry-pick operation is in progress".into())
                })?;
            let pick = repo.inner().find_commit(pick_id)?;
            let head = repo.inner().head()?.peel_to_commit()?;
            let tree_id = repo.inner().index()?.write_tree()?;
            let tree = repo.inner().find_tree(tree_id)?;
            let signature = repo
                .inner()
                .signature()
                .or_else(|_| git2::Signature::now("GITBX", "gitbx@localhost"))?;
            let message = pick.message().unwrap_or("Cherry-pick commit").to_string();
            let id = repo.inner().commit(
                Some("HEAD"),
                &signature,
                &signature,
                &message,
                &tree,
                &[&head],
            )?;
            drop(pick);
            drop(head);
            drop(tree);
            repo.inner_mut().cleanup_state()?;
            repo.inner().checkout_head(None)?;
            Ok(id.to_string())
        })
    }

    pub fn continue_revert(path: &str) -> Result<String> {
        Self::with_write_lock(path, |repo| {
            if repo.inner().index()?.has_conflicts() {
                return Err(GitbxError::MergeConflict(
                    "Resolve all conflicts before continuing the revert".into(),
                ));
            }
            Self::ensure_index_has_no_conflict_markers(repo)?;
            let revert_id = repo
                .inner()
                .find_reference("REVERT_HEAD")?
                .target()
                .ok_or_else(|| GitbxError::General("No revert operation is in progress".into()))?;
            let revert_commit = repo.inner().find_commit(revert_id)?;
            let head = repo.inner().head()?.peel_to_commit()?;
            let tree_id = repo.inner().index()?.write_tree()?;
            let tree = repo.inner().find_tree(tree_id)?;
            let signature = repo
                .inner()
                .signature()
                .or_else(|_| git2::Signature::now("GITBX", "gitbx@localhost"))?;
            let summary = revert_commit.summary().unwrap_or("commit");
            let message = format!(
                "Revert \"{}\"\n\nThis reverts commit {}.",
                summary, revert_id
            );
            let id = repo.inner().commit(
                Some("HEAD"),
                &signature,
                &signature,
                &message,
                &tree,
                &[&head],
            )?;
            drop(revert_commit);
            drop(head);
            drop(tree);
            repo.inner_mut().cleanup_state()?;
            repo.inner().checkout_head(None)?;
            Ok(id.to_string())
        })
    }

    pub fn get_commit_changes(
        path: &str,
        commit_id: &str,
    ) -> Result<Vec<crate::status::FileStatusItem>> {
        Self::open(path)?.get_commit_changes(commit_id)
    }

    pub fn worktree(path: &str, destination: &str, branch_name: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            let branch = repo.inner().find_branch(branch_name, BranchType::Local)?;
            let reference = branch.get();
            let name = branch_name.replace(['/', '\\'], "-");
            let mut options = git2::WorktreeAddOptions::new();
            options.checkout_existing(true).reference(Some(reference));
            repo.inner()
                .worktree(&name, Path::new(destination), Some(&options))?;
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::GitService;
    use git2::Repository;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn rejects_paths_outside_repository() {
        let dir = tempdir().expect("tempdir");
        let repo = dir.path().join("repo");
        fs::create_dir(&repo).expect("repo dir");
        Repository::init(&repo).expect("init");
        assert!(GitService::validate_file_path(repo.to_str().unwrap(), "../outside.txt").is_err());
    }

    #[test]
    fn creates_and_checks_out_branch() {
        let dir = tempdir().expect("tempdir");
        let repo_path = dir.path().join("repo");
        fs::create_dir(&repo_path).expect("repo dir");
        let repo = Repository::init(&repo_path).expect("init");
        fs::write(repo_path.join("README.md"), "hello\n").expect("write");
        let mut index = repo.index().expect("index");
        index
            .add_path(std::path::Path::new("README.md"))
            .expect("stage");
        let tree_id = index.write_tree().expect("tree");
        index.write().expect("write index");
        let tree = repo.find_tree(tree_id).expect("tree object");
        let signature = git2::Signature::now("Test", "test@example.com").expect("signature");
        repo.commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])
            .expect("commit");
        drop(tree);
        drop(index);
        GitService::create_branch(repo_path.to_str().unwrap(), "feature/test", None, true)
            .expect("branch");
        assert_eq!(
            GitService::info(repo_path.to_str().unwrap())
                .expect("info")
                .head_branch
                .as_deref(),
            Some("feature/test")
        );
    }

    #[test]
    fn protects_current_branch_from_deletion() {
        let dir = tempdir().expect("tempdir");
        let repo_path = dir.path().join("repo");
        fs::create_dir(&repo_path).expect("repo dir");
        let repo = Repository::init(&repo_path).expect("init");
        fs::write(repo_path.join("README.md"), "hello\n").expect("write");
        let mut index = repo.index().expect("index");
        index
            .add_path(std::path::Path::new("README.md"))
            .expect("stage");
        let tree_id = index.write_tree().expect("tree");
        index.write().expect("write index");
        let tree = repo.find_tree(tree_id).expect("tree object");
        let signature = git2::Signature::now("Test", "test@example.com").expect("signature");
        repo.commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])
            .expect("commit");
        drop(tree);
        drop(index);

        let path_str = repo_path.to_str().unwrap();
        let head_branch = GitService::info(path_str)
            .expect("info")
            .head_branch
            .unwrap();
        assert!(GitService::delete_branch(path_str, &head_branch, true).is_err());
    }

    #[test]
    fn discards_untracked_file_by_removing_from_disk() {
        let dir = tempdir().expect("tempdir");
        let repo_path = dir.path().join("repo");
        fs::create_dir(&repo_path).expect("repo dir");
        Repository::init(&repo_path).expect("init");
        let new_file = repo_path.join("untracked.txt");
        fs::write(&new_file, "content").expect("write");
        assert!(new_file.exists());

        let path_str = repo_path.to_str().unwrap();
        GitService::discard_file(path_str, Some("untracked.txt")).expect("discard");
        assert!(!new_file.exists());
    }

    #[test]
    fn revert_and_merge_cleanup_repository_state() {
        let dir = tempdir().expect("tempdir");
        let repo_path = dir.path().join("repo");
        fs::create_dir(&repo_path).expect("repo dir");
        let repo = Repository::init(&repo_path).expect("init");
        fs::write(repo_path.join("file.txt"), "v1\n").expect("write");
        let mut index = repo.index().expect("index");
        index
            .add_path(std::path::Path::new("file.txt"))
            .expect("stage");
        let tree_id = index.write_tree().expect("tree");
        index.write().expect("write index");
        let tree = repo.find_tree(tree_id).expect("tree object");
        let signature = git2::Signature::now("Test", "test@example.com").expect("signature");
        let c1 = repo
            .commit(Some("HEAD"), &signature, &signature, "first", &tree, &[])
            .expect("commit");

        fs::write(repo_path.join("file.txt"), "v2\n").expect("write");
        index
            .add_path(std::path::Path::new("file.txt"))
            .expect("stage");
        let tree_id2 = index.write_tree().expect("tree");
        index.write().expect("write index");
        let tree2 = repo.find_tree(tree_id2).expect("tree object");
        let c1_obj = repo.find_commit(c1).expect("find c1");
        let c2 = repo
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                "second",
                &tree2,
                &[&c1_obj],
            )
            .expect("commit");
        drop(c1_obj);
        drop(tree);
        drop(tree2);
        drop(index);

        let path_str = repo_path.to_str().unwrap();
        GitService::revert(path_str, &c2.to_string()).expect("revert");
        let info = GitService::info(path_str).expect("info");
        assert!(!info.is_reverting);
        assert!(!info.is_dirty);
        let changes = GitService::get_commit_changes(path_str, &info.head_commit_id.unwrap())
            .expect("commit changes");
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].path, "file.txt");
    }
}
