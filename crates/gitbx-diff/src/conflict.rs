use crate::{ConflictChunk, Merge3Engine};
use git2::IndexEntry;
use gitbx_core::{GitService, GitbxError, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictFileContent {
    pub file_path: String,
    pub ancestor: Option<String>,
    pub ours: Option<String>,
    pub theirs: Option<String>,
    pub worktree: Option<String>,
    pub chunks: Vec<ConflictChunk>,
    pub is_binary: bool,
}

struct ConflictBlobVersions {
    ancestor: Option<Vec<u8>>,
    ours: Option<Vec<u8>>,
    theirs: Option<Vec<u8>>,
}

fn entry_bytes(repo: &git2::Repository, entry: Option<&IndexEntry>) -> Result<Option<Vec<u8>>> {
    entry
        .map(|entry| {
            repo.find_blob(entry.id)
                .map(|blob| blob.content().to_vec())
                .map_err(GitbxError::from)
        })
        .transpose()
}

fn entry_matches(entry: Option<&IndexEntry>, file_path: &str) -> bool {
    entry.is_some_and(|entry| entry.path == file_path.as_bytes())
}

fn find_conflict_bytes(repo: &git2::Repository, file_path: &str) -> Result<ConflictBlobVersions> {
    let index = repo.index()?;
    let conflicts = index.conflicts()?;
    for conflict in conflicts {
        let conflict = conflict?;
        if entry_matches(conflict.ancestor.as_ref(), file_path)
            || entry_matches(conflict.our.as_ref(), file_path)
            || entry_matches(conflict.their.as_ref(), file_path)
        {
            return Ok(ConflictBlobVersions {
                ancestor: entry_bytes(repo, conflict.ancestor.as_ref())?,
                ours: entry_bytes(repo, conflict.our.as_ref())?,
                theirs: entry_bytes(repo, conflict.their.as_ref())?,
            });
        }
    }
    Err(GitbxError::General(format!(
        "File '{file_path}' is not currently conflicted"
    )))
}

fn text_content(bytes: &Option<Vec<u8>>) -> Option<String> {
    bytes
        .as_deref()
        .and_then(|value| std::str::from_utf8(value).ok())
        .map(ToOwned::to_owned)
}

pub fn load_conflict_file(repo_path: &str, file_path: &str) -> Result<ConflictFileContent> {
    let repo = GitService::open(repo_path)?;
    let validated = GitService::validate_file_path(repo_path, file_path)?;
    let versions = find_conflict_bytes(repo.inner(), file_path)?;
    let worktree_bytes = fs::read(&validated).ok();
    let is_binary = [
        &versions.ancestor,
        &versions.ours,
        &versions.theirs,
        &worktree_bytes,
    ]
    .iter()
    .filter_map(|value| value.as_deref())
    .any(|value| std::str::from_utf8(value).is_err());
    let worktree = text_content(&worktree_bytes);
    let chunks = worktree
        .as_deref()
        .map(Merge3Engine::parse_conflicted_file)
        .unwrap_or_default();

    Ok(ConflictFileContent {
        file_path: file_path.to_string(),
        ancestor: text_content(&versions.ancestor),
        ours: text_content(&versions.ours),
        theirs: text_content(&versions.theirs),
        worktree,
        chunks,
        is_binary,
    })
}

pub fn resolve_conflict_file(
    repo_path: &str,
    file_path: &str,
    content: Option<&str>,
    side: Option<&str>,
) -> Result<()> {
    let validated = GitService::validate_file_path(repo_path, file_path)?;
    GitService::with_write_lock(repo_path, |repo| {
        let versions = find_conflict_bytes(repo.inner(), file_path)?;
        let resolved = match side {
            Some("ours") => versions.ours,
            Some("theirs") => versions.theirs,
            Some(other) => {
                return Err(GitbxError::General(format!(
                    "Unsupported conflict resolution side '{other}'"
                )))
            }
            None => Some(
                content
                    .ok_or_else(|| {
                        GitbxError::General(
                            "Resolved content is required for a manual resolution".into(),
                        )
                    })?
                    .as_bytes()
                    .to_vec(),
            ),
        };

        if let Some(bytes) = resolved {
            if let Ok(text) = std::str::from_utf8(&bytes) {
                if GitService::contains_conflict_markers(text) {
                    return Err(GitbxError::MergeConflict(format!(
                        "File '{file_path}' still contains unresolved conflict markers"
                    )));
                }
            }
            if let Some(parent) = validated.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&validated, bytes)?;
            let mut index = repo.inner().index()?;
            index.add_path(Path::new(file_path))?;
            index.write()?;
        } else {
            if validated.exists() {
                fs::remove_file(&validated)?;
            }
            let mut index = repo.inner().index()?;
            index.remove_path(Path::new(file_path))?;
            index.write()?;
        }
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::{load_conflict_file, resolve_conflict_file};
    use git2::{Oid, Repository};
    use gitbx_core::GitService;
    use std::fs;
    use std::path::Path;
    use tempfile::{tempdir, TempDir};

    fn commit_file(repo: &Repository, repo_path: &Path, content: &str, message: &str) -> Oid {
        fs::write(repo_path.join("file.txt"), content).expect("write file");
        let mut index = repo.index().expect("index");
        index.add_path(Path::new("file.txt")).expect("stage file");
        index.write().expect("write index");
        let tree_id = index.write_tree().expect("tree id");
        let tree = repo.find_tree(tree_id).expect("tree");
        let signature = git2::Signature::now("Test", "test@example.com").expect("signature");
        let parent = repo.head().ok().and_then(|head| head.peel_to_commit().ok());
        let parents = parent.as_ref().map(|value| vec![value]).unwrap_or_default();
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &parents,
        )
        .expect("commit")
    }

    fn conflicted_repo() -> (TempDir, String) {
        let dir = tempdir().expect("tempdir");
        let repo_path = dir.path().join("repo");
        fs::create_dir(&repo_path).expect("repo dir");
        let repo = Repository::init(&repo_path).expect("init");
        repo.set_head("refs/heads/main").expect("set main");
        let base = commit_file(&repo, &repo_path, "base\n", "base");
        let base_commit = repo.find_commit(base).expect("base commit");
        repo.branch("feature", &base_commit, false)
            .expect("feature branch");
        drop(base_commit);

        commit_file(&repo, &repo_path, "ours\n", "ours");
        repo.set_head("refs/heads/feature").expect("feature head");
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .expect("checkout feature");
        commit_file(&repo, &repo_path, "theirs\n", "theirs");
        repo.set_head("refs/heads/main").expect("main head");
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .expect("checkout main");
        drop(repo);

        let path = repo_path.to_string_lossy().to_string();
        assert!(GitService::merge(&path, "feature", false).is_err());
        (dir, path)
    }

    fn modify_delete_conflicted_repo() -> (TempDir, String) {
        let dir = tempdir().expect("tempdir");
        let repo_path = dir.path().join("repo");
        fs::create_dir(&repo_path).expect("repo dir");
        let repo = Repository::init(&repo_path).expect("init");
        repo.set_head("refs/heads/main").expect("set main");
        let base = commit_file(&repo, &repo_path, "base\n", "base");
        let base_commit = repo.find_commit(base).expect("base commit");
        repo.branch("feature", &base_commit, false)
            .expect("feature branch");
        drop(base_commit);

        commit_file(&repo, &repo_path, "ours\n", "ours");
        repo.set_head("refs/heads/feature").expect("feature head");
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .expect("checkout feature");
        fs::remove_file(repo_path.join("file.txt")).expect("delete file");
        let mut index = repo.index().expect("index");
        index
            .remove_path(Path::new("file.txt"))
            .expect("stage delete");
        index.write().expect("write index");
        let tree_id = index.write_tree().expect("tree id");
        let tree = repo.find_tree(tree_id).expect("tree");
        let parent = repo.head().unwrap().peel_to_commit().unwrap();
        let signature = git2::Signature::now("Test", "test@example.com").expect("signature");
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            "delete",
            &tree,
            &[&parent],
        )
        .expect("delete commit");
        drop(parent);
        drop(tree);
        drop(index);
        repo.set_head("refs/heads/main").expect("main head");
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .expect("checkout main");
        drop(repo);

        let path = repo_path.to_string_lossy().to_string();
        assert!(GitService::merge(&path, "feature", false).is_err());
        (dir, path)
    }

    fn rebase_conflicted_repo() -> (TempDir, String) {
        let dir = tempdir().expect("tempdir");
        let repo_path = dir.path().join("repo");
        fs::create_dir(&repo_path).expect("repo dir");
        let repo = Repository::init(&repo_path).expect("init");
        repo.set_head("refs/heads/main").expect("set main");
        let base = commit_file(&repo, &repo_path, "base\n", "base");
        let base_commit = repo.find_commit(base).expect("base commit");
        repo.branch("feature", &base_commit, false)
            .expect("feature branch");
        drop(base_commit);
        commit_file(&repo, &repo_path, "main\n", "main change");

        repo.set_head("refs/heads/feature").expect("feature head");
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .expect("checkout feature");
        commit_file(&repo, &repo_path, "feature\n", "feature change");
        drop(repo);

        let path = repo_path.to_string_lossy().to_string();
        assert!(GitService::rebase(&path, "main").is_err());
        (dir, path)
    }

    #[test]
    fn resolves_and_continues_a_real_merge_conflict() {
        let (_dir, path) = conflicted_repo();
        let conflict = load_conflict_file(&path, "file.txt").expect("load conflict");
        assert_eq!(conflict.ancestor.as_deref(), Some("base\n"));
        assert_eq!(conflict.ours.as_deref(), Some("ours\n"));
        assert_eq!(conflict.theirs.as_deref(), Some("theirs\n"));
        assert!(!conflict.is_binary);
        assert!(conflict.chunks.iter().any(|chunk| {
            matches!(
                chunk.section_type,
                crate::ConflictSectionType::Conflict { .. }
            )
        }));
        let status = GitService::open(&path)
            .expect("repo")
            .get_status()
            .expect("status");
        assert_eq!(status.conflicted_files.len(), 1);
        assert!(status.unstaged_files.is_empty());
        assert_eq!(status.total_changes, 1);

        resolve_conflict_file(&path, "file.txt", Some("resolved\n"), None)
            .expect("resolve conflict");
        assert!(GitService::open(&path)
            .expect("repo")
            .get_status()
            .expect("status")
            .conflicted_files
            .is_empty());

        GitService::continue_merge(&path).expect("continue merge");
        let repo = Repository::open(&path).expect("open");
        assert_eq!(
            repo.head()
                .unwrap()
                .peel_to_commit()
                .unwrap()
                .parent_count(),
            2
        );
        assert_eq!(
            fs::read_to_string(Path::new(&path).join("file.txt")).unwrap(),
            "resolved\n"
        );
        assert_eq!(repo.state(), git2::RepositoryState::Clean);
    }

    #[test]
    fn rejects_unresolved_markers_and_restores_on_abort() {
        let (_dir, path) = conflicted_repo();
        let unresolved = "<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\n";
        assert!(resolve_conflict_file(&path, "file.txt", Some(unresolved), None).is_err());
        assert!(GitService::open(&path)
            .expect("repo")
            .get_status()
            .expect("status")
            .conflicted_files
            .iter()
            .any(|file| file.path == "file.txt"));

        let repo = Repository::open(&path).expect("open for external stage");
        let mut index = repo.index().expect("index");
        index
            .add_path(Path::new("file.txt"))
            .expect("externally stage unresolved file");
        index.write().expect("write index");
        drop(index);
        drop(repo);
        assert!(GitService::continue_merge(&path).is_err());

        GitService::abort_merge(&path).expect("abort merge");
        let repo = Repository::open(&path).expect("open");
        assert_eq!(repo.state(), git2::RepositoryState::Clean);
        assert_eq!(
            fs::read_to_string(Path::new(&path).join("file.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "ours\n"
        );
        assert!(!repo.index().unwrap().has_conflicts());
    }

    #[test]
    fn resolves_modify_delete_conflict_by_keeping_deletion() {
        let (_dir, path) = modify_delete_conflicted_repo();
        let conflict = load_conflict_file(&path, "file.txt").expect("load conflict");
        assert_eq!(conflict.ours.as_deref(), Some("ours\n"));
        assert!(conflict.theirs.is_none());

        resolve_conflict_file(&path, "file.txt", None, Some("theirs")).expect("keep deletion");
        GitService::continue_merge(&path).expect("continue merge");
        assert!(!Path::new(&path).join("file.txt").exists());
    }

    #[test]
    fn resolves_and_continues_a_rebase_conflict() {
        let (_dir, path) = rebase_conflicted_repo();
        let info = GitService::info(&path).expect("info");
        assert!(info.is_rebasing);
        assert!(load_conflict_file(&path, "file.txt").is_ok());

        resolve_conflict_file(&path, "file.txt", Some("rebased\n"), None)
            .expect("resolve conflict");
        GitService::continue_rebase(&path).expect("continue rebase");
        let repo = Repository::open(&path).expect("open");
        assert_eq!(repo.state(), git2::RepositoryState::Clean);
        assert_eq!(
            fs::read_to_string(Path::new(&path).join("file.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "rebased\n"
        );
    }
}
