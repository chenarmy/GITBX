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

    pub fn delete_branch(path: &str, name: &str, force: bool) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            let mut branch = repo.inner().find_branch(name, BranchType::Local)?;
            if !force && !branch.is_head() {
                branch.delete()?;
                return Ok(());
            }
            if force {
                branch.delete()?;
            } else {
                return Err(GitbxError::General(
                    "Cannot delete the current branch without force".into(),
                ));
            }
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
            let mut checkout = git2::build::CheckoutBuilder::new();
            if let Some(file_path) = file_path {
                Self::validate_file_path(path, file_path)?;
                checkout.path(file_path);
            } else {
                checkout.force();
            }
            repo.inner().checkout_head(Some(&mut checkout))?;
            Ok(())
        })
    }

    pub fn reset(path: &str, target: &str, mode: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| {
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
            repo.inner()
                .merge(&[&annotated], Some(&mut options), None)?;
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
            repo.inner().checkout_head(None)?;
            Ok(())
        })
    }

    pub fn cherry_pick(path: &str, commit_id: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            let commit = repo.inner().find_commit(git2::Oid::from_str(commit_id)?)?;
            repo.inner().cherrypick(&commit, None)?;
            if repo.inner().index()?.has_conflicts() {
                return Err(GitbxError::MergeConflict(
                    "Cherry-pick produced conflicts".into(),
                ));
            }
            Ok(())
        })
    }

    pub fn revert(path: &str, commit_id: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            let commit = repo.inner().find_commit(git2::Oid::from_str(commit_id)?)?;
            repo.inner().revert(&commit, None)?;
            if repo.inner().index()?.has_conflicts() {
                return Err(GitbxError::MergeConflict(
                    "Revert produced conflicts".into(),
                ));
            }
            Ok(())
        })
    }

    pub fn fetch_all(path: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| repo.fetch_all())
    }

    pub fn push(path: &str, remote: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| repo.push_current(remote))
    }

    pub fn pull(path: &str, remote: &str) -> Result<()> {
        Self::fetch_all(path)?;
        let branch = Self::info(path)?
            .head_branch
            .ok_or_else(|| GitbxError::General("HEAD is detached".into()))?;
        Self::merge(path, &format!("{remote}/{branch}"), false)
    }

    pub fn rebase(path: &str, upstream: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            let object = repo.inner().revparse_single(upstream)?;
            let annotated = repo.inner().find_annotated_commit(object.id())?;
            let mut rebase = repo.inner().rebase(None, Some(&annotated), None, None)?;
            let signature = repo
                .inner()
                .signature()
                .or_else(|_| git2::Signature::now("GITBX", "gitbx@localhost"))?;
            while let Some(operation) = rebase.next() {
                let _operation = operation?;
                rebase.commit(None, &signature, None)?;
            }
            rebase.finish(Some(&signature))?;
            repo.inner().checkout_head(None)?;
            Ok(())
        })
    }

    pub fn abort_operation(path: &str) -> Result<()> {
        Self::with_write_lock(path, |repo| Ok(repo.inner_mut().cleanup_state()?))
    }

    pub fn continue_merge(path: &str) -> Result<String> {
        Self::with_write_lock(path, |repo| {
            if repo.inner().index()?.has_conflicts() {
                return Err(GitbxError::MergeConflict(
                    "Resolve all conflicts before continuing the merge".into(),
                ));
            }
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
            let mut rebase = repo.inner().rebase(None, None, None, None)?;
            let signature = repo
                .inner()
                .signature()
                .or_else(|_| git2::Signature::now("GITBX", "gitbx@localhost"))?;
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
}
