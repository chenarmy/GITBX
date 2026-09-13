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

        // Keep the repository-level flag consistent with the Changes panel.
        // `statuses(None)` uses libgit2 defaults and can report false positives
        // on Windows repositories with checkout filters/line-ending rules,
        // while `get_status` applies the explicit options used by the UI.
        let is_dirty = self
            .get_status()
            .map(|status| status.total_changes > 0)
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
        let mut commit_oids = Vec::new();
        for oid_res in revwalk.take(max_count) {
            let oid = oid_res?;
            let commit = self.inner.find_commit(oid)?;

            let parent_ids = commit.parent_ids().map(|id| id.to_string()).collect();
            let author = commit.author();
            let committer = commit.committer();

            commit_oids.push(oid);
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
                changed_paths: Vec::new(),
            });
        }

        // Resolve changed paths in parallel: one full tree diff per commit is
        // the dominant cost of loading the commit graph, and the diffs are
        // independent, so spread them across worker threads.
        let resolved_paths = resolve_changed_paths_parallel(&self.path, &commit_oids);
        for (commit, paths) in commits.iter_mut().zip(resolved_paths) {
            commit.changed_paths = paths;
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
        let path = std::path::Path::new(&normalized);

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

        let mut matched_commits = Vec::new();
        for oid_res in revwalk {
            if matched_commits.len() >= max_count {
                break;
            }
            let oid = oid_res?;
            let commit = self.inner.find_commit(oid)?;
            let tree = commit.tree().ok();

            let current_id = tree
                .as_ref()
                .and_then(|t| t.get_path(path).ok())
                .map(|entry| entry.id());

            let mut touched = false;
            let parent_count = commit.parent_count();
            if parent_count == 0 {
                touched = current_id.is_some();
            } else {
                for i in 0..parent_count {
                    let parent = commit.parent(i)?;
                    let parent_tree = parent.tree().ok();
                    let parent_file_id = parent_tree
                        .as_ref()
                        .and_then(|t| t.get_path(path).ok())
                        .map(|entry| entry.id());
                    if parent_file_id != current_id {
                        touched = true;
                        break;
                    }
                }
            }

            if !touched {
                continue;
            }

            let parent_ids = commit.parent_ids().map(|id| id.to_string()).collect();
            let author = commit.author();
            let committer = commit.committer();

            matched_commits.push(CommitDetail {
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
                changed_paths: vec![normalized.clone()],
            });
        }

        Ok(matched_commits)
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

fn changed_paths_for(repo: &Git2Repo, commit: &git2::Commit<'_>) -> Vec<String> {
    let Ok(tree) = commit.tree() else {
        return Vec::new();
    };
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    if let Some(ref pt) = parent_tree {
        if pt.id() == tree.id() {
            return Vec::new();
        }
    }
    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.include_unmodified(false);
    diff_opts.skip_binary_check(true);
    diff_opts.ignore_filemode(true);
    diff_opts.ignore_submodules(true);
    let Ok(diff) = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut diff_opts))
    else {
        return Vec::new();
    };
    let mut paths = Vec::with_capacity(diff.deltas().len() * 2);
    for delta in diff.deltas() {
        if let Some(p) = delta.new_file().path().and_then(|p| p.to_str()) {
            paths.push(p.replace('\\', "/"));
        }
        if let Some(p) = delta.old_file().path().and_then(|p| p.to_str()) {
            paths.push(p.replace('\\', "/"));
        }
    }
    paths.sort();
    paths.dedup();
    paths
}

fn resolve_changed_paths_parallel(repo_path: &Path, oids: &[git2::Oid]) -> Vec<Vec<String>> {
    let len = oids.len();
    if len == 0 {
        return Vec::new();
    }
    let threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .min(8)
        .min(len);
    let chunk_size = len.div_ceil(threads);

    std::thread::scope(|scope| {
        let mut handles = Vec::with_capacity(threads);
        for chunk in oids.chunks(chunk_size) {
            let repo_path = repo_path.to_path_buf();
            let chunk = chunk.to_vec();
            handles.push(scope.spawn(move || {
                let Ok(repo) = Git2Repo::open(&repo_path) else {
                    return vec![Vec::new(); chunk.len()];
                };
                let mut out = Vec::with_capacity(chunk.len());
                for oid in &chunk {
                    let paths = repo
                        .find_commit(*oid)
                        .map(|commit| changed_paths_for(&repo, &commit))
                        .unwrap_or_default();
                    out.push(paths);
                }
                out
            }));
        }
        let mut result = Vec::with_capacity(len);
        for handle in handles {
            if let Ok(part) = handle.join() {
                result.extend(part);
            }
        }
        result
    })
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
