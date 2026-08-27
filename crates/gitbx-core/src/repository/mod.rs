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
    pub containing_branch_refs: Vec<String>,
    pub tag_refs: Vec<String>,
    pub changed_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlameLine {
    pub line_number: usize,
    pub content: String,
    pub commit_id: String,
    pub short_id: String,
    pub author_name: String,
    pub author_email: String,
    pub author_time: i64,
    pub summary: String,
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
        let mut branch_map: std::collections::HashMap<git2::Oid, Vec<String>> =
            std::collections::HashMap::new();
        let mut revision_tips = std::collections::HashSet::new();
        if let Ok(branches) = self.inner.branches(None) {
            for item in branches.flatten() {
                let is_remote = item.1 == git2::BranchType::Remote;
                let name = item.0.name().ok().flatten().unwrap_or("").to_string();
                if name.is_empty() || (is_remote && (name == "HEAD" || name.ends_with("/HEAD"))) {
                    continue;
                }
                if let Ok(target) = item.0.get().peel_to_commit() {
                    revision_tips.insert(target.id());
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
                        revision_tips.insert(commit.id());
                        tag_map
                            .entry(commit.id())
                            .or_default()
                            .push(name.to_string());
                    }
                }
            }
        }

        if let Ok(head) = self.inner.head().and_then(|head| head.peel_to_commit()) {
            revision_tips.insert(head.id());
        }
        if revision_tips.is_empty() {
            return Ok(Vec::new());
        }

        let mut revwalk = self.inner.revwalk()?;
        for tip in revision_tips {
            revwalk.push(tip)?;
        }
        revwalk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)?;

        let mut commits = Vec::new();
        for oid_res in revwalk.take(max_count) {
            let oid = oid_res?;
            let commit = self.inner.find_commit(oid)?;

            let parent_ids = commit.parent_ids().map(|id| id.to_string()).collect();
            let author = commit.author();
            let committer = commit.committer();

            let mut changed_paths = Vec::new();
            for file in self
                .get_commit_changes(&commit.id().to_string())
                .unwrap_or_default()
            {
                changed_paths.push(file.path);
                if let Some(old_path) = file.old_path {
                    changed_paths.push(old_path);
                }
            }
            changed_paths.sort();
            changed_paths.dedup();

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
                containing_branch_refs: Vec::new(),
                tag_refs: tag_map.get(&commit.id()).cloned().unwrap_or_default(),
                changed_paths,
            });
        }

        for commit in &mut commits {
            let Ok(commit_id) = git2::Oid::from_str(&commit.id) else {
                continue;
            };
            for (tip_id, branch_names) in &branch_map {
                if *tip_id == commit_id
                    || self
                        .inner
                        .graph_descendant_of(*tip_id, commit_id)
                        .unwrap_or(false)
                {
                    commit
                        .containing_branch_refs
                        .extend(branch_names.iter().cloned());
                }
            }
            commit.containing_branch_refs.sort();
            commit.containing_branch_refs.dedup();
        }

        Ok(commits)
    }

    pub fn get_file_history(&self, file_path: &str, max_count: usize) -> Result<Vec<CommitDetail>> {
        let normalized = file_path.replace('\\', "/");
        let scan_limit = max_count.saturating_mul(50).clamp(max_count, 10_000);
        Ok(self
            .get_commits(scan_limit)?
            .into_iter()
            .filter(|commit| {
                commit
                    .changed_paths
                    .iter()
                    .any(|path| path.replace('\\', "/") == normalized)
            })
            .take(max_count)
            .collect())
    }

    pub fn blame_file(&self, file_path: &str, revision: Option<&str>) -> Result<Vec<BlameLine>> {
        let commit = self
            .inner
            .revparse_single(revision.unwrap_or("HEAD"))?
            .peel_to_commit()?;
        let bytes = self.commit_file(&commit.id().to_string(), file_path)?;
        let content = String::from_utf8(bytes)
            .map_err(|_| GitbxError::General("Binary files cannot be annotated".into()))?;
        let lines: Vec<&str> = content.lines().collect();
        let mut options = git2::BlameOptions::new();
        options
            .newest_commit(commit.id())
            .track_copies_same_file(true)
            .use_mailmap(true);
        let blame = self
            .inner
            .blame_file(Path::new(file_path), Some(&mut options))?;
        let mut result = Vec::with_capacity(lines.len());
        for (index, content) in lines.into_iter().enumerate() {
            let line_number = index + 1;
            let hunk = blame.get_line(line_number).ok_or_else(|| {
                GitbxError::General(format!("No blame information for line {line_number}"))
            })?;
            let commit_id = hunk.final_commit_id();
            let signature = hunk.final_signature();
            let blamed_commit = self.inner.find_commit(commit_id)?;
            result.push(BlameLine {
                line_number,
                content: content.to_string(),
                commit_id: commit_id.to_string(),
                short_id: blamed_commit
                    .as_object()
                    .short_id()?
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
                author_name: signature.name().unwrap_or("").to_string(),
                author_email: signature.email().unwrap_or("").to_string(),
                author_time: signature.when().seconds(),
                summary: blamed_commit.summary().unwrap_or("").to_string(),
            });
        }
        Ok(result)
    }

    pub fn get_commit_changes(
        &self,
        commit_id: &str,
    ) -> Result<Vec<crate::status::FileStatusItem>> {
        let commit = self.inner.find_commit(git2::Oid::from_str(commit_id)?)?;
        let tree = commit.tree()?;
        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
        self.get_changes_between_trees(parent_tree.as_ref(), &tree)
    }

    pub fn get_changes_between(
        &self,
        base_revision: &str,
        target_revision: &str,
    ) -> Result<Vec<crate::status::FileStatusItem>> {
        let base = self
            .inner
            .revparse_single(base_revision)?
            .peel_to_commit()?;
        let target = self
            .inner
            .revparse_single(target_revision)?
            .peel_to_commit()?;
        let base_tree = base.tree()?;
        let target_tree = target.tree()?;
        self.get_changes_between_trees(Some(&base_tree), &target_tree)
    }

    fn get_changes_between_trees(
        &self,
        base_tree: Option<&git2::Tree<'_>>,
        target_tree: &git2::Tree<'_>,
    ) -> Result<Vec<crate::status::FileStatusItem>> {
        let mut diff_opts = git2::DiffOptions::new();
        let mut diff =
            self.inner
                .diff_tree_to_tree(base_tree, Some(target_tree), Some(&mut diff_opts))?;
        let mut find_opts = git2::DiffFindOptions::new();
        find_opts.renames(true);
        diff.find_similar(Some(&mut find_opts))?;

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
    use git2::{IndexAddOption, Signature};
    use std::fs;
    use std::path::Path;
    use tempfile::tempdir;

    fn commit_all(repo: &Repository, message: &str) -> git2::Oid {
        let mut index = repo.inner().index().expect("index");
        index
            .add_all(["*"], IndexAddOption::DEFAULT, None)
            .expect("stage files");
        index.write().expect("write index");
        let tree_id = index.write_tree().expect("write tree");
        let tree = repo.inner().find_tree(tree_id).expect("find tree");
        let signature = Signature::now("GITBX", "gitbx@example.com").expect("signature");
        let parent = repo
            .inner()
            .head()
            .ok()
            .and_then(|head| head.peel_to_commit().ok());
        let parents: Vec<&git2::Commit<'_>> = parent.iter().collect();
        repo.inner()
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                message,
                &tree,
                &parents,
            )
            .expect("commit")
    }

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

    #[test]
    fn commit_history_includes_containing_branches_and_changed_paths() {
        let dir = tempdir().expect("tempdir");
        let repo = Repository::init(dir.path(), false).expect("init repository");
        repo.inner()
            .set_head("refs/heads/main")
            .expect("set main branch");
        fs::write(dir.path().join("README.md"), "hello\n").expect("write fixture");

        let mut index = repo.inner().index().expect("open index");
        index
            .add_path(Path::new("README.md"))
            .expect("stage fixture");
        let tree_id = index.write_tree().expect("write tree");
        let tree = repo.inner().find_tree(tree_id).expect("find tree");
        let signature = Signature::now("Test", "test@example.com").expect("signature");
        repo.inner()
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                "initial commit",
                &tree,
                &[],
            )
            .expect("create commit");

        let commits = repo.get_commits(10).expect("commit history");
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].changed_paths, vec!["README.md"]);
        assert_eq!(commits[0].branch_refs, vec!["main"]);
        assert_eq!(commits[0].containing_branch_refs, vec!["main"]);
    }

    #[test]
    fn commit_history_includes_unmerged_branch_tips() {
        let dir = tempdir().expect("tempdir");
        let repo = Repository::init(dir.path(), false).expect("init repository");
        repo.inner()
            .set_head("refs/heads/main")
            .expect("set main branch");
        fs::write(dir.path().join("base.txt"), "base\n").expect("write base");
        commit_all(&repo, "base");

        repo.create_branch("feature", None)
            .expect("create feature branch");
        repo.checkout_branch("feature").expect("checkout feature");
        fs::write(dir.path().join("feature.txt"), "feature\n").expect("write feature");
        let feature_commit = commit_all(&repo, "feature only");
        repo.checkout_branch("main").expect("checkout main");

        let commits = repo.get_commits(20).expect("all refs history");
        assert!(commits
            .iter()
            .any(|commit| commit.id == feature_commit.to_string()));
        assert!(commits
            .iter()
            .find(|commit| commit.id == feature_commit.to_string())
            .is_some_and(|commit| commit.branch_refs == vec!["feature"]));
    }

    #[test]
    fn compares_files_between_two_revisions() {
        let dir = tempdir().expect("tempdir");
        let repo = Repository::init(dir.path(), false).expect("init repository");
        fs::write(dir.path().join("existing.txt"), "before\n").expect("write base file");
        let base = commit_all(&repo, "base");

        fs::write(dir.path().join("existing.txt"), "after\n").expect("update file");
        fs::write(dir.path().join("added.txt"), "new\n").expect("write added file");
        let target = commit_all(&repo, "target");

        let changes = repo
            .get_changes_between(&base.to_string(), &target.to_string())
            .expect("compare revisions");
        assert_eq!(changes.len(), 2);
        assert!(changes.iter().any(|item| item.path == "existing.txt"));
        assert!(changes.iter().any(|item| item.path == "added.txt"));
    }

    #[test]
    fn reports_file_history_and_line_blame() {
        let dir = tempdir().expect("tempdir");
        let repo = Repository::init(dir.path(), false).expect("init repository");
        fs::write(dir.path().join("notes.txt"), "kept\nold\n").expect("write base file");
        let base = commit_all(&repo, "base notes");

        fs::write(dir.path().join("notes.txt"), "kept\nnew\n").expect("update file");
        let target = commit_all(&repo, "update notes");

        let history = repo
            .get_file_history("notes.txt", 10)
            .expect("file history");
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].id, target.to_string());
        assert_eq!(history[1].id, base.to_string());

        let blame = repo.blame_file("notes.txt", None).expect("file blame");
        assert_eq!(blame.len(), 2);
        assert_eq!(blame[0].commit_id, base.to_string());
        assert_eq!(blame[1].commit_id, target.to_string());
        assert_eq!(blame[1].content, "new");
    }
}
