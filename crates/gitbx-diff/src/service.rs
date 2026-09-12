use crate::{DiffEngine, FileDiff};
use gitbx_core::{GitService, GitbxError};
use std::path::Path;

pub fn get_file_diff(
    repo_path: &str,
    file_path: &str,
    staged: bool,
    commit_id: Option<&str>,
    base_commit_id: Option<&str>,
    target_commit_id: Option<&str>,
    old_file_path: Option<&str>,
) -> Result<FileDiff, GitbxError> {
    GitService::validate_file_path(repo_path, file_path)?;
    let repo = GitService::open(repo_path)?;

    let (old_bytes, new_bytes) =
        if let (Some(base_id), Some(target_id)) = (base_commit_id, target_commit_id) {
            let old_path = old_file_path.unwrap_or(file_path);
            let read_revision_file = |revision: &str, path: &str| -> Vec<u8> {
                repo.inner()
                    .revparse_single(revision)
                    .ok()
                    .and_then(|object| object.peel_to_commit().ok())
                    .and_then(|commit| commit.tree().ok()?.get_path(Path::new(path)).ok())
                    .and_then(|entry| repo.inner().find_blob(entry.id()).ok())
                    .map(|blob| blob.content().to_vec())
                    .unwrap_or_default()
            };
            (
                read_revision_file(base_id, old_path),
                read_revision_file(target_id, file_path),
            )
        } else if let Some(commit_id) = commit_id {
            let commit = repo.inner().find_commit(git2::Oid::from_str(commit_id)?)?;
            let old = commit
                .parent(0)
                .ok()
                .and_then(|parent| {
                    parent
                        .tree()
                        .ok()?
                        .get_path(Path::new(file_path))
                        .ok()
                        .and_then(|entry| {
                            repo.inner()
                                .find_blob(entry.id())
                                .ok()
                                .map(|blob| blob.content().to_vec())
                        })
                })
                .unwrap_or_default();
            let new = commit
                .tree()
                .ok()
                .and_then(|tree| tree.get_path(Path::new(file_path)).ok())
                .and_then(|entry| {
                    repo.inner()
                        .find_blob(entry.id())
                        .ok()
                        .map(|blob| blob.content().to_vec())
                })
                .unwrap_or_default();
            (old, new)
        } else if staged {
            let old = repo
                .inner()
                .head()
                .ok()
                .and_then(|head| head.peel_to_commit().ok())
                .and_then(|commit| {
                    commit
                        .tree()
                        .ok()?
                        .get_path(Path::new(file_path))
                        .ok()
                        .and_then(|entry| {
                            repo.inner()
                                .find_blob(entry.id())
                                .ok()
                                .map(|blob| blob.content().to_vec())
                        })
                })
                .unwrap_or_default();
            let new = repo.index_file(file_path).unwrap_or_default();
            (old, new)
        } else {
            let old = repo
                .index_file(file_path)
                .or_else(|_| {
                    repo.inner()
                        .head()
                        .ok()
                        .and_then(|head| head.peel_to_commit().ok())
                        .and_then(|commit| {
                            commit
                                .tree()
                                .ok()?
                                .get_path(Path::new(file_path))
                                .ok()
                                .and_then(|entry| {
                                    repo.inner()
                                        .find_blob(entry.id())
                                        .ok()
                                        .map(|blob| blob.content().to_vec())
                                })
                        })
                        .ok_or_else(|| GitbxError::General("No previous version".into()))
                })
                .unwrap_or_default();
            let new = repo.workdir_file(file_path).unwrap_or_default();
            (old, new)
        };

    let is_binary =
        std::str::from_utf8(&old_bytes).is_err() || std::str::from_utf8(&new_bytes).is_err();
    if is_binary {
        return Ok(FileDiff {
            old_path: Some(file_path.to_string()),
            new_path: Some(file_path.to_string()),
            is_binary: true,
            hunks: Vec::new(),
            additions: 0,
            deletions: 0,
        });
    }
    // libgit2 status honors Git's text filters, while these helpers read the
    // raw index/worktree bytes. Normalize line endings so a Windows checkout
    // does not render every line as changed solely because of CRLF conversion.
    let old_content = String::from_utf8_lossy(&old_bytes).replace("\r\n", "\n");
    let new_content = String::from_utf8_lossy(&new_bytes).replace("\r\n", "\n");
    Ok(DiffEngine::diff_strings(
        &old_content,
        &new_content,
        Some(old_file_path.unwrap_or(file_path)),
        Some(file_path),
    ))
}

#[cfg(test)]
mod tests {
    use super::get_file_diff;
    use git2::{IndexAddOption, Repository, Signature};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn worktree_diff_ignores_crlf_conversion() {
        let directory = tempdir().expect("tempdir");
        let repo = Repository::init(directory.path()).expect("init");
        fs::write(directory.path().join("file.txt"), "one\ntwo\n").expect("write base");
        let mut index = repo.index().expect("index");
        index
            .add_all(["*"], IndexAddOption::DEFAULT, None)
            .expect("stage");
        index.write().expect("write index");
        let tree_id = index.write_tree().expect("tree id");
        let tree = repo.find_tree(tree_id).expect("tree");
        let signature = Signature::now("Test", "test@example.com").expect("signature");
        repo.commit(Some("HEAD"), &signature, &signature, "base", &tree, &[])
            .expect("commit");
        drop(tree);
        drop(index);
        drop(repo);

        fs::write(directory.path().join("file.txt"), "one\r\nchanged\r\n").expect("write worktree");
        let diff = get_file_diff(
            directory.path().to_str().expect("repo path"),
            "file.txt",
            false,
            None,
            None,
            None,
            None,
        )
        .expect("diff");
        assert_eq!(diff.additions, 1);
        assert_eq!(diff.deletions, 1);
    }
}
