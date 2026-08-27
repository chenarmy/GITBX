use crate::{open_repo, GitbxError, Repository, RepositoryInfo, Result};
use git2::{BranchType, ObjectType, ResetType};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

#[derive(Debug, Clone, serde::Serialize)]
pub struct RebaseCommit {
    pub id: String,
    pub short_id: String,
    pub summary: String,
    pub author_name: String,
    pub author_time: i64,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct RebasePlanItem {
    pub commit_id: String,
    pub action: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SyncStatus {
    pub upstream: Option<String>,
    pub incoming: Vec<RebaseCommit>,
    pub outgoing: Vec<RebaseCommit>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub head: String,
    pub branch: Option<String>,
    pub is_main: bool,
    pub is_detached: bool,
    pub is_locked: bool,
    pub lock_reason: Option<String>,
    pub is_prunable: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct LocalHistoryEntry {
    pub id: String,
    pub file_path: String,
    pub timestamp: i64,
    pub label: String,
    pub size: u64,
}

static REPO_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();

fn repo_locks() -> &'static Mutex<HashMap<PathBuf, Arc<Mutex<()>>>> {
    REPO_LOCKS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub struct GitService;

impl GitService {
    pub fn discover_git_roots(path: &str) -> Result<Vec<String>> {
        let start = std::fs::canonicalize(path)?;
        let mut roots = Vec::new();
        let mut queue = std::collections::VecDeque::from([(start, 0usize)]);
        while let Some((directory, depth)) = queue.pop_front() {
            if roots.len() >= 100 {
                break;
            }
            if directory.join(".git").exists() {
                roots.push(directory.to_string_lossy().to_string());
                // Nested repositories can still exist, but do not crawl metadata/build directories.
            }
            if depth >= 5 {
                continue;
            }
            let Ok(entries) = std::fs::read_dir(&directory) else {
                continue;
            };
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if [".git", "node_modules", "target", "dist", "build", ".idea"]
                    .contains(&name.as_str())
                {
                    continue;
                }
                if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                    queue.push_back((entry.path(), depth + 1));
                }
            }
        }
        roots.sort();
        roots.dedup();
        Ok(roots)
    }

    pub fn pull_request_url(path: &str, base: &str, compare: &str) -> Result<String> {
        let repo = Self::open(path)?;
        let remote = repo.inner().find_remote("origin")?;
        let raw = remote
            .url()
            .ok_or_else(|| GitbxError::General("Origin has no URL".into()))?;
        let normalized = if let Some(rest) = raw.strip_prefix("git@") {
            let (host, repository) = rest
                .split_once(':')
                .ok_or_else(|| GitbxError::General("Unsupported remote URL".into()))?;
            format!("https://{host}/{repository}")
        } else if raw.starts_with("ssh://") {
            let rest = raw
                .trim_start_matches("ssh://")
                .split_once('@')
                .map(|(_, value)| value)
                .unwrap_or(raw.trim_start_matches("ssh://"));
            format!("https://{rest}")
        } else {
            raw.to_string()
        };
        let root = normalized.trim_end_matches('/').trim_end_matches(".git");
        let base = base.trim();
        let compare = compare.trim();
        if root.contains("github.com") {
            Ok(format!("{root}/compare/{base}...{compare}?expand=1"))
        } else if root.contains("gitlab") {
            Ok(format!("{root}/-/merge_requests/new?merge_request[source_branch]={compare}&merge_request[target_branch]={base}"))
        } else if root.contains("bitbucket") {
            Ok(format!(
                "{root}/pull-requests/new?source={compare}&dest={base}"
            ))
        } else {
            Err(GitbxError::General("Pull/Merge request creation is supported for GitHub, GitLab, and Bitbucket remotes".into()))
        }
    }

    fn history_directory(repo: &Repository, file_path: &str) -> PathBuf {
        let key = file_path
            .as_bytes()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        repo.inner().path().join("gitbx-local-history").join(key)
    }

    pub fn create_local_history_snapshot(
        path: &str,
        file_path: &str,
        label: &str,
    ) -> Result<LocalHistoryEntry> {
        let repo = Self::open(path)?;
        let source = Self::validate_file_path(path, file_path)?;
        let content = std::fs::read(&source)?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        let id = format!("{}-{}", now.as_millis(), std::process::id());
        let directory = Self::history_directory(&repo, file_path);
        std::fs::create_dir_all(&directory)?;
        std::fs::write(directory.join(format!("{id}.bin")), &content)?;
        let clean_label = label.replace(['\r', '\n'], " ");
        std::fs::write(
            directory.join(format!("{id}.meta")),
            format!("{}\n{}", now.as_secs(), clean_label),
        )?;
        Ok(LocalHistoryEntry {
            id,
            file_path: file_path.to_string(),
            timestamp: now.as_secs() as i64,
            label: clean_label,
            size: content.len() as u64,
        })
    }

    pub fn list_local_history(path: &str, file_path: &str) -> Result<Vec<LocalHistoryEntry>> {
        Self::validate_file_path(path, file_path)?;
        let repo = Self::open(path)?;
        let directory = Self::history_directory(&repo, file_path);
        if !directory.exists() {
            return Ok(Vec::new());
        }
        let mut entries = Vec::new();
        for entry in std::fs::read_dir(directory)?.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let Some(id) = file_name.strip_suffix(".meta") else {
                continue;
            };
            let metadata = std::fs::read_to_string(entry.path()).unwrap_or_default();
            let mut lines = metadata.lines();
            let timestamp = lines
                .next()
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
            let label = lines.collect::<Vec<_>>().join(" ");
            let content_path = entry.path().with_file_name(format!("{id}.bin"));
            let size = std::fs::metadata(content_path)
                .map(|value| value.len())
                .unwrap_or(0);
            entries.push(LocalHistoryEntry {
                id: id.to_string(),
                file_path: file_path.to_string(),
                timestamp,
                label,
                size,
            });
        }
        entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp).then_with(|| b.id.cmp(&a.id)));
        Ok(entries)
    }

    pub fn restore_local_history(path: &str, file_path: &str, snapshot_id: &str) -> Result<()> {
        if snapshot_id.is_empty()
            || !snapshot_id
                .chars()
                .all(|character| character.is_ascii_digit() || character == '-')
        {
            return Err(GitbxError::General("Invalid local history snapshot".into()));
        }
        let target = Self::validate_file_path(path, file_path)?;
        if target.exists() {
            let _ = Self::create_local_history_snapshot(
                path,
                file_path,
                "Before local history restore",
            );
        }
        let repo = Self::open(path)?;
        let snapshot = Self::history_directory(&repo, file_path).join(format!("{snapshot_id}.bin"));
        let content = std::fs::read(snapshot)?;
        std::fs::write(target, content)?;
        Ok(())
    }

    pub fn read_local_history(path: &str, file_path: &str, snapshot_id: &str) -> Result<String> {
        if snapshot_id.is_empty()
            || !snapshot_id
                .chars()
                .all(|character| character.is_ascii_digit() || character == '-')
        {
            return Err(GitbxError::General("Invalid local history snapshot".into()));
        }
        Self::validate_file_path(path, file_path)?;
        let repo = Self::open(path)?;
        let content = std::fs::read(
            Self::history_directory(&repo, file_path).join(format!("{snapshot_id}.bin")),
        )?;
        String::from_utf8(content).map_err(|_| {
            GitbxError::General("Binary local history snapshots cannot be previewed".into())
        })
    }
    fn git_output(path: &str, args: &[&str]) -> Result<String> {
        let output = std::process::Command::new("git")
            .arg("-C")
            .arg(path)
            .args(args)
            .output()
            .map_err(|error| GitbxError::General(format!("Failed to start Git: {error}")))?;
        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).to_string());
        }
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(GitbxError::General(if message.is_empty() {
            "Git command failed".into()
        } else {
            message
        }))
    }

    pub fn list_worktrees(path: &str) -> Result<Vec<WorktreeInfo>> {
        let output = Self::git_output(path, &["worktree", "list", "--porcelain"])?;
        let main_path = Self::open(path)?.inner().workdir().map(|value| {
            value
                .to_string_lossy()
                .trim_end_matches(['/', '\\'])
                .to_string()
        });
        let mut result = Vec::new();
        for block in output
            .split("\n\n")
            .filter(|block| !block.trim().is_empty())
        {
            let mut worktree_path = String::new();
            let mut head = String::new();
            let mut branch = None;
            let mut detached = false;
            let mut locked = false;
            let mut lock_reason = None;
            let mut prunable = false;
            for line in block.lines() {
                if let Some(value) = line.strip_prefix("worktree ") {
                    worktree_path = value.to_string();
                } else if let Some(value) = line.strip_prefix("HEAD ") {
                    head = value.to_string();
                } else if let Some(value) = line.strip_prefix("branch ") {
                    branch = Some(
                        value
                            .strip_prefix("refs/heads/")
                            .unwrap_or(value)
                            .to_string(),
                    );
                } else if line == "detached" {
                    detached = true;
                } else if let Some(value) = line.strip_prefix("locked") {
                    locked = true;
                    if !value.trim().is_empty() {
                        lock_reason = Some(value.trim().to_string());
                    }
                } else if line.starts_with("prunable") {
                    prunable = true;
                }
            }
            let normalized = worktree_path.trim_end_matches(['/', '\\']);
            let is_main = main_path.as_deref() == Some(normalized);
            result.push(WorktreeInfo {
                path: worktree_path,
                head,
                branch,
                is_main,
                is_detached: detached,
                is_locked: locked,
                lock_reason,
                is_prunable: prunable,
            });
        }
        Ok(result)
    }

    fn validate_managed_worktree(
        path: &str,
        worktree_path: &str,
        allow_main: bool,
    ) -> Result<WorktreeInfo> {
        let item = Self::list_worktrees(path)?
            .into_iter()
            .find(|item| item.path == worktree_path)
            .ok_or_else(|| {
                GitbxError::General("Worktree is not registered in this repository".into())
            })?;
        if item.is_main && !allow_main {
            return Err(GitbxError::General(
                "The main worktree cannot be removed or locked here".into(),
            ));
        }
        Ok(item)
    }

    pub fn remove_worktree(path: &str, worktree_path: &str, force: bool) -> Result<()> {
        Self::validate_managed_worktree(path, worktree_path, false)?;
        let mut args = vec!["worktree", "remove"];
        if force {
            args.push("--force");
        }
        args.push(worktree_path);
        Self::git_output(path, &args).map(|_| ())
    }

    pub fn set_worktree_locked(
        path: &str,
        worktree_path: &str,
        locked: bool,
        reason: Option<&str>,
    ) -> Result<()> {
        Self::validate_managed_worktree(path, worktree_path, false)?;
        if locked {
            let mut args = vec!["worktree", "lock"];
            if let Some(reason) = reason.map(str::trim).filter(|value| !value.is_empty()) {
                args.extend(["--reason", reason]);
            }
            args.push(worktree_path);
            Self::git_output(path, &args).map(|_| ())
        } else {
            Self::git_output(path, &["worktree", "unlock", worktree_path]).map(|_| ())
        }
    }

    pub fn prune_worktrees(path: &str) -> Result<()> {
        Self::git_output(path, &["worktree", "prune"]).map(|_| ())
    }
    fn commit_range(
        repo: &Repository,
        include: git2::Oid,
        exclude: git2::Oid,
    ) -> Result<Vec<RebaseCommit>> {
        let mut walk = repo.inner().revwalk()?;
        walk.push(include)?;
        walk.hide(exclude)?;
        walk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)?;
        walk.map(|oid| {
            let commit = repo.inner().find_commit(oid?)?;
            let author = commit.author();
            Ok(RebaseCommit {
                id: commit.id().to_string(),
                short_id: commit
                    .as_object()
                    .short_id()?
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
                summary: commit.summary().unwrap_or("").to_string(),
                author_name: author.name().unwrap_or("").to_string(),
                author_time: author.when().seconds(),
            })
        })
        .collect()
    }

    pub fn get_sync_status(path: &str) -> Result<SyncStatus> {
        let repo = Self::open(path)?;
        let head = repo.inner().head()?.peel_to_commit()?.id();
        let branch_name = repo.inner().head()?.shorthand().unwrap_or("").to_string();
        let branch = repo.inner().find_branch(&branch_name, BranchType::Local)?;
        let Ok(upstream_branch) = branch.upstream() else {
            return Ok(SyncStatus {
                upstream: None,
                incoming: Vec::new(),
                outgoing: Vec::new(),
            });
        };
        let upstream_name = upstream_branch.name()?.map(ToOwned::to_owned);
        let upstream_id = upstream_branch.get().peel_to_commit()?.id();
        Ok(SyncStatus {
            upstream: upstream_name,
            incoming: Self::commit_range(&repo, upstream_id, head)?,
            outgoing: Self::commit_range(&repo, head, upstream_id)?,
        })
    }

    pub fn pull_with_strategy(path: &str, remote: &str, strategy: &str) -> Result<()> {
        Self::fetch_all(path)?;
        let target = {
            let repo = Self::open(path)?;
            let branch_name = repo
                .inner()
                .head()?
                .shorthand()
                .ok_or_else(|| GitbxError::General("HEAD is detached".into()))?
                .to_string();
            let branch = repo.inner().find_branch(&branch_name, BranchType::Local)?;
            branch
                .upstream()
                .ok()
                .and_then(|branch| branch.name().ok().flatten().map(ToOwned::to_owned))
                .unwrap_or_else(|| format!("{remote}/{branch_name}"))
        };
        match strategy {
            "merge" => Self::merge(path, &target, false),
            "rebase" => Self::rebase(path, &target),
            "ff-only" => {
                let repo = Self::open(path)?;
                let head = repo.inner().head()?.peel_to_commit()?.id();
                let target_id = repo
                    .inner()
                    .revparse_single(&target)?
                    .peel_to_commit()?
                    .id();
                if head != target_id && !repo.inner().graph_descendant_of(target_id, head)? {
                    return Err(GitbxError::General(
                        "Fast-forward pull is not possible because the branches have diverged"
                            .into(),
                    ));
                }
                drop(repo);
                Self::merge(path, &target, false)
            }
            _ => Err(GitbxError::General("Unknown pull strategy".into())),
        }
    }

    pub fn push_force_with_lease(path: &str, remote: &str) -> Result<()> {
        Self::run_git(
            path,
            &[
                "push".into(),
                "--force-with-lease".into(),
                remote.into(),
                "HEAD".into(),
            ],
        )
    }
    pub fn get_interactive_rebase_commits(path: &str, upstream: &str) -> Result<Vec<RebaseCommit>> {
        let repo = Self::open(path)?;
        let upstream_id = repo
            .inner()
            .revparse_single(upstream)?
            .peel_to_commit()?
            .id();
        let head_id = repo.inner().head()?.peel_to_commit()?.id();
        let mut walk = repo.inner().revwalk()?;
        walk.push(head_id)?;
        walk.hide(upstream_id)?;
        walk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::REVERSE)?;
        walk.map(|oid| {
            let commit = repo.inner().find_commit(oid?)?;
            let author = commit.author();
            let author_name = author.name().unwrap_or("").to_string();
            let author_time = author.when().seconds();
            Ok(RebaseCommit {
                id: commit.id().to_string(),
                short_id: commit
                    .as_object()
                    .short_id()?
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
                summary: commit.summary().unwrap_or("").to_string(),
                author_name,
                author_time,
            })
        })
        .collect()
    }

    pub fn interactive_rebase(path: &str, upstream: &str, plan: &[RebasePlanItem]) -> Result<()> {
        if plan.is_empty() {
            return Err(GitbxError::General(
                "The interactive rebase plan is empty".into(),
            ));
        }
        let valid_actions = ["pick", "reword", "squash", "fixup", "drop"];
        if plan
            .iter()
            .any(|item| !valid_actions.contains(&item.action.as_str()))
        {
            return Err(GitbxError::General(
                "The rebase plan contains an unsupported action".into(),
            ));
        }
        let first_kept = plan.iter().find(|item| item.action != "drop");
        if first_kept.is_some_and(|item| item.action == "squash" || item.action == "fixup") {
            return Err(GitbxError::General(
                "The first retained commit cannot be squash or fixup".into(),
            ));
        }
        let repo = Self::open(path)?;
        if repo.info()?.is_dirty {
            return Err(GitbxError::General(
                "Commit, stash, or shelve local changes before interactive rebase".into(),
            ));
        }
        let git_dir = repo.inner().path();
        let token = format!("gitbx-rebase-{}", std::process::id());
        let todo_path = git_dir.join(format!("{token}.todo"));
        let editor_path = git_dir.join(format!("{token}-editor.sh"));
        let shell_path = |value: &std::path::Path| value.to_string_lossy().replace('\\', "/");
        let mut todo = String::new();
        let mut message_paths = Vec::new();
        for (index, item) in plan.iter().enumerate() {
            let commit = repo
                .inner()
                .find_commit(git2::Oid::from_str(&item.commit_id)?)?;
            let action = if item.action == "reword" {
                "pick"
            } else {
                item.action.as_str()
            };
            todo.push_str(&format!(
                "{action} {} {}\n",
                item.commit_id,
                commit.summary().unwrap_or("")
            ));
            if item.action == "reword" {
                let message = item
                    .message
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| {
                        GitbxError::General("A reword action requires a commit message".into())
                    })?;
                let message_path = git_dir.join(format!("{token}-{index}.message"));
                std::fs::write(&message_path, message)?;
                todo.push_str(&format!(
                    "exec git commit --amend --no-verify -F '{}'\n",
                    shell_path(&message_path).replace('\'', "'\\''")
                ));
                message_paths.push(message_path);
            }
        }
        std::fs::write(&todo_path, todo)?;
        std::fs::write(&editor_path, "#!/bin/sh\ncat \"$GITBX_TODO\" > \"$1\"\n")?;
        let editor_command = format!("sh \"{}\"", shell_path(&editor_path));
        let output = std::process::Command::new("git")
            .arg("-C")
            .arg(path)
            .args(["rebase", "-i", upstream])
            .env("GIT_SEQUENCE_EDITOR", editor_command)
            .env("GIT_EDITOR", "true")
            .env("GITBX_TODO", shell_path(&todo_path))
            .output()
            .map_err(|error| GitbxError::General(format!("Failed to start Git: {error}")))?;
        if output.status.success() {
            let _ = std::fs::remove_file(todo_path);
            let _ = std::fs::remove_file(editor_path);
            for message_path in message_paths {
                let _ = std::fs::remove_file(message_path);
            }
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(GitbxError::General(if stderr.is_empty() {
            stdout
        } else {
            stderr
        }))
    }
    pub fn get_commit_template(path: &str) -> Result<Option<String>> {
        let repo = Self::open(path)?;
        let config = repo.inner().config()?;
        let Ok(template_path) = config.get_string("commit.template") else {
            return Ok(None);
        };
        let candidate = std::path::PathBuf::from(&template_path);
        let resolved = if candidate.is_absolute() {
            candidate
        } else {
            repo.inner()
                .workdir()
                .unwrap_or_else(|| std::path::Path::new(path))
                .join(candidate)
        };
        std::fs::read_to_string(&resolved)
            .map(Some)
            .map_err(|error| {
                GitbxError::General(format!(
                    "Failed to read commit template {}: {error}",
                    resolved.display()
                ))
            })
    }

    pub fn create_commit_advanced(
        path: &str,
        message: &str,
        author: &str,
        email: &str,
        amend: bool,
        sign: bool,
        pre_commit_command: Option<&str>,
    ) -> Result<String> {
        if message.trim().is_empty() {
            return Err(GitbxError::General("Commit message cannot be empty".into()));
        }
        if let Some(command) = pre_commit_command
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            let output = if cfg!(windows) {
                std::process::Command::new("cmd")
                    .args(["/C", command])
                    .current_dir(path)
                    .output()
            } else {
                std::process::Command::new("sh")
                    .args(["-c", command])
                    .current_dir(path)
                    .output()
            }
            .map_err(|error| {
                GitbxError::General(format!("Failed to run pre-commit command: {error}"))
            })?;
            if !output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let detail = if stderr.is_empty() { stdout } else { stderr };
                return Err(GitbxError::General(format!(
                    "Pre-commit command failed: {detail}"
                )));
            }
        }

        let mut args = vec![
            "commit".to_string(),
            "-m".to_string(),
            message.to_string(),
            "--author".to_string(),
            format!("{author} <{email}>"),
        ];
        if amend {
            args.push("--amend".into());
            args.push("--allow-empty".into());
        }
        if sign {
            args.push("--gpg-sign".into());
        }
        let output = std::process::Command::new("git")
            .arg("-C")
            .arg(path)
            .args(&args)
            .env("GIT_COMMITTER_NAME", author)
            .env("GIT_COMMITTER_EMAIL", email)
            .output()
            .map_err(|error| GitbxError::General(format!("Failed to start Git: {error}")))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return Err(GitbxError::General(if stderr.is_empty() {
                stdout
            } else {
                stderr
            }));
        }
        Self::resolve_revision(path, "HEAD")
    }
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
            if let Ok(mut local_branch) = repo.inner().find_branch(name, BranchType::Local) {
                if local_branch.is_head() {
                    return Err(GitbxError::General(
                        "Cannot delete the currently checked out branch".into(),
                    ));
                }
                local_branch.delete()?;
                return Ok(());
            }

            if let Ok(mut remote_branch) = repo.inner().find_branch(name, BranchType::Remote) {
                remote_branch.delete()?;
                return Ok(());
            }

            Err(GitbxError::General(format!("Branch '{}' not found", name)))
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

    pub fn apply_stash(path: &str, index: usize) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            let mut opts = git2::StashApplyOptions::new();
            repo.inner_mut().stash_apply(index, Some(&mut opts))?;
            Ok(())
        })
    }

    pub fn drop_stash(path: &str, index: usize) -> Result<()> {
        Self::with_write_lock(path, |repo| {
            repo.inner_mut().stash_drop(index)?;
            Ok(())
        })
    }

    pub fn get_stash_changes(
        path: &str,
        commit_id: &str,
    ) -> Result<Vec<crate::status::FileStatusItem>> {
        let repo = Self::open(path)?;
        repo.get_changes_between(&format!("{commit_id}^"), commit_id)
    }

    fn run_git(path: &str, args: &[String]) -> Result<()> {
        let output = std::process::Command::new("git")
            .arg("-C")
            .arg(path)
            .args(args)
            .output()
            .map_err(|error| GitbxError::General(format!("Failed to start Git: {error}")))?;
        if output.status.success() {
            return Ok(());
        }
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(GitbxError::General(if message.is_empty() {
            "Git command failed".to_string()
        } else {
            message
        }))
    }

    pub fn rename_stash(path: &str, index: usize, message: &str) -> Result<()> {
        if message.trim().is_empty() {
            return Err(GitbxError::General("Stash name cannot be empty".into()));
        }
        let commit_id = {
            let mut repo = Self::open(path)?;
            repo.list_stashes()?
                .into_iter()
                .find(|stash| stash.index == index)
                .map(|stash| stash.commit_id)
                .ok_or_else(|| GitbxError::General(format!("Stash {index} was not found")))?
        };
        Self::run_git(
            path,
            &["stash".into(), "drop".into(), format!("stash@{{{index}}}")],
        )?;
        // Store the same immutable stash commit again with a new reflog message.
        // Renaming moves the entry to the top, matching common GUI behavior.
        Self::run_git(
            path,
            &[
                "stash".into(),
                "store".into(),
                "-m".into(),
                message.trim().into(),
                commit_id,
            ],
        )
    }

    pub fn create_shelf(path: &str, message: &str, file_paths: &[String]) -> Result<()> {
        if file_paths.is_empty() {
            return Err(GitbxError::General(
                "Select at least one file to shelve".into(),
            ));
        }
        for file_path in file_paths {
            Self::validate_file_path(path, file_path)?;
        }
        let shelf_name = if message.trim().is_empty() {
            "Untitled shelf"
        } else {
            message.trim()
        };
        let mut args = vec![
            "stash".into(),
            "push".into(),
            "--include-untracked".into(),
            "-m".into(),
            format!("[Shelf] {shelf_name}"),
            "--".into(),
        ];
        args.extend(file_paths.iter().cloned());
        Self::run_git(path, &args)
    }

    pub fn discard_file(path: &str, file_path: Option<&str>) -> Result<()> {
        if let Some(file_path) = file_path {
            if Self::validate_file_path(path, file_path).is_ok_and(|value| value.exists()) {
                let _ = Self::create_local_history_snapshot(path, file_path, "Before discard");
            }
        }
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

    /// Stage the complete working tree, create a commit, and push the checked-out
    /// branch.
    pub fn commit_and_push(path: &str, message: &str, author: &str, email: &str) -> Result<String> {
        Self::with_write_lock(path, |repo| {
            repo.stage_all()?;
            let commit_id = repo.create_commit(message, author, email)?;
            repo.push_current("origin")?;
            Ok(commit_id)
        })
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

    pub fn get_changes_between(
        path: &str,
        base_revision: &str,
        target_revision: &str,
    ) -> Result<Vec<crate::status::FileStatusItem>> {
        Self::open(path)?.get_changes_between(base_revision, target_revision)
    }

    pub fn resolve_revision(path: &str, revision: &str) -> Result<String> {
        let repo = Self::open(path)?;
        let commit = repo.inner().revparse_single(revision)?.peel_to_commit()?;
        Ok(commit.id().to_string())
    }

    pub fn get_file_history(
        path: &str,
        file_path: &str,
        max_count: usize,
    ) -> Result<Vec<crate::CommitDetail>> {
        Self::validate_file_path(path, file_path)?;
        Self::open(path)?.get_file_history(file_path, max_count.clamp(1, 500))
    }

    pub fn blame_file(
        path: &str,
        file_path: &str,
        revision: Option<&str>,
    ) -> Result<Vec<crate::BlameLine>> {
        Self::validate_file_path(path, file_path)?;
        Self::open(path)?.blame_file(file_path, revision)
    }

    /// Apply one validated unified diff to either the index or the working tree.
    ///
    /// The caller supplies a single-file patch generated from the diff currently
    /// shown to the user. Restricting every delta to `file_path` prevents a
    /// crafted desktop or Web request from modifying another repository path.
    pub fn apply_partial_patch(
        path: &str,
        file_path: &str,
        patch: &str,
        target: &str,
    ) -> Result<()> {
        Self::validate_file_path(path, file_path)?;
        if patch.trim().is_empty() {
            return Err(GitbxError::General("The selected patch is empty".into()));
        }

        if target == "workdir"
            && Self::validate_file_path(path, file_path).is_ok_and(|value| value.exists())
        {
            let _ = Self::create_local_history_snapshot(path, file_path, "Before partial discard");
        }
        Self::with_write_lock(path, |repo| {
            if repo.inner().index()?.has_conflicts() {
                return Err(GitbxError::MergeConflict(
                    "Resolve conflicted files before applying a partial patch".into(),
                ));
            }

            let diff = git2::Diff::from_buffer(patch.as_bytes())?;
            let deltas: Vec<_> = diff.deltas().collect();
            if deltas.len() != 1 {
                return Err(GitbxError::General(
                    "A partial patch must contain exactly one file".into(),
                ));
            }

            let expected = file_path.replace('\\', "/");
            let matches_expected = |candidate: Option<&Path>| {
                candidate.is_none_or(|candidate| {
                    candidate.to_string_lossy().replace('\\', "/") == expected
                })
            };
            let delta = &deltas[0];
            if !matches_expected(delta.old_file().path())
                || !matches_expected(delta.new_file().path())
            {
                return Err(GitbxError::General(
                    "The patch path does not match the selected file".into(),
                ));
            }

            let location = match target {
                "index" => git2::ApplyLocation::Index,
                "workdir" => {
                    Self::ensure_no_operation(repo, "discarding a partial change")?;
                    git2::ApplyLocation::WorkDir
                }
                _ => {
                    return Err(GitbxError::General(format!(
                        "Unsupported partial patch target: {target}"
                    )))
                }
            };
            repo.inner().apply(&diff, location, None)?;
            if target == "index" {
                repo.inner().index()?.write()?;
            }
            Ok(())
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
    fn applies_partial_patches_to_index_and_workdir() {
        let dir = tempdir().expect("tempdir");
        let repo_path = dir.path().join("repo");
        fs::create_dir(&repo_path).expect("repo dir");
        let repo = Repository::init(&repo_path).expect("init");
        fs::write(repo_path.join("file.txt"), "one\ntwo\nthree\n").expect("write initial");
        let mut index = repo.index().expect("index");
        index
            .add_path(std::path::Path::new("file.txt"))
            .expect("stage initial");
        let tree_id = index.write_tree().expect("tree");
        index.write().expect("write index");
        let tree = repo.find_tree(tree_id).expect("tree object");
        let signature = git2::Signature::now("Test", "test@example.com").expect("signature");
        repo.commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])
            .expect("commit");
        drop(tree);
        drop(index);

        fs::write(repo_path.join("file.txt"), "ONE\ntwo\nTHREE\n").expect("write changes");
        let forward = concat!(
            "diff --git a/file.txt b/file.txt\n",
            "--- a/file.txt\n",
            "+++ b/file.txt\n",
            "@@ -1,3 +1,3 @@\n",
            "-one\n",
            "+ONE\n",
            " two\n",
            " three\n"
        );
        let reverse_index = concat!(
            "diff --git a/file.txt b/file.txt\n",
            "--- a/file.txt\n",
            "+++ b/file.txt\n",
            "@@ -1,3 +1,3 @@\n",
            "-ONE\n",
            "+one\n",
            " two\n",
            " three\n"
        );
        let reverse_workdir = concat!(
            "diff --git a/file.txt b/file.txt\n",
            "--- a/file.txt\n",
            "+++ b/file.txt\n",
            "@@ -1,3 +1,3 @@\n",
            "-ONE\n",
            "+one\n",
            " two\n",
            " THREE\n"
        );
        let path_str = repo_path.to_str().unwrap();

        GitService::apply_partial_patch(path_str, "file.txt", forward, "index")
            .expect("stage partial patch");
        let core_repo = GitService::open(path_str).expect("open");
        assert_eq!(
            String::from_utf8(core_repo.index_file("file.txt").expect("index file")).unwrap(),
            "ONE\ntwo\nthree\n"
        );
        assert_eq!(
            fs::read_to_string(repo_path.join("file.txt")).expect("workdir file"),
            "ONE\ntwo\nTHREE\n"
        );

        GitService::apply_partial_patch(path_str, "file.txt", reverse_index, "index")
            .expect("unstage partial patch");
        let core_repo = GitService::open(path_str).expect("reopen");
        assert_eq!(
            String::from_utf8(core_repo.index_file("file.txt").expect("index file")).unwrap(),
            "one\ntwo\nthree\n"
        );

        GitService::apply_partial_patch(path_str, "file.txt", reverse_workdir, "workdir")
            .expect("discard partial patch");
        assert_eq!(
            fs::read_to_string(repo_path.join("file.txt"))
                .expect("workdir file")
                .replace("\r\n", "\n"),
            "one\ntwo\nTHREE\n"
        );
    }

    #[test]
    fn rejects_partial_patch_for_a_different_file() {
        let dir = tempdir().expect("tempdir");
        let repo_path = dir.path().join("repo");
        fs::create_dir(&repo_path).expect("repo dir");
        Repository::init(&repo_path).expect("init");
        fs::write(repo_path.join("file.txt"), "one\n").expect("write");
        let patch = concat!(
            "diff --git a/other.txt b/other.txt\n",
            "--- a/other.txt\n",
            "+++ b/other.txt\n",
            "@@ -1 +1 @@\n",
            "-one\n",
            "+two\n"
        );
        assert!(GitService::apply_partial_patch(
            repo_path.to_str().unwrap(),
            "file.txt",
            patch,
            "index"
        )
        .is_err());
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

    #[test]
    fn checkout_remote_branch_creates_local_tracking_branch() {
        let dir = tempdir().expect("tempdir");
        let origin_path = dir.path().join("origin");
        let local_path = dir.path().join("local");
        fs::create_dir(&origin_path).expect("origin dir");
        let origin_repo = Repository::init_bare(&origin_path).expect("init bare origin");

        // Clone to local
        let local_repo =
            Repository::clone(origin_path.to_str().unwrap(), &local_path).expect("clone");
        fs::write(local_path.join("file.txt"), "hello\n").expect("write file");
        let mut index = local_repo.index().expect("index");
        index
            .add_path(std::path::Path::new("file.txt"))
            .expect("add");
        let tree_id = index.write_tree().expect("tree");
        index.write().expect("write index");
        let tree = local_repo.find_tree(tree_id).expect("tree");
        let sig = git2::Signature::now("Test", "test@example.com").expect("sig");
        let c1 = local_repo
            .commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
            .expect("commit");
        drop(tree);
        drop(index);

        // Push master to origin
        let mut origin_remote = local_repo.find_remote("origin").expect("remote");
        let mut push_opts = git2::PushOptions::new();
        origin_remote
            .push(
                &["refs/heads/master:refs/heads/master"],
                Some(&mut push_opts),
            )
            .expect("push master");

        // Create remote branch on origin: v1.1
        let c1_obj = origin_repo
            .find_commit(c1)
            .expect("find commit on bare origin");
        origin_repo
            .branch("v1.1", &c1_obj, false)
            .expect("create v1.1 branch on bare origin");

        // Fetch on local
        let local_path_str = local_path.to_str().unwrap();
        GitService::fetch_all(local_path_str).expect("fetch all");

        // Now checkout "origin/v1.1" directly
        let local_core_repo = GitService::open(local_path_str).expect("open");
        local_core_repo
            .checkout_branch("origin/v1.1")
            .expect("checkout remote branch");

        // Check that HEAD is now local branch "v1.1" and NOT detached!
        let info = GitService::info(local_path_str).expect("info");
        assert_eq!(info.head_branch.as_deref(), Some("v1.1"));
        assert!(!local_core_repo
            .inner()
            .head_detached()
            .expect("head detached check"));

        // Check that upstream is set to origin/v1.1
        let branches = local_core_repo.list_branches(None).expect("list branches");
        let local_v11 = branches
            .iter()
            .find(|b| b.name == "v1.1" && !b.is_remote)
            .expect("local branch v1.1 exists");
        assert_eq!(local_v11.upstream_name.as_deref(), Some("origin/v1.1"));

        // Create origin/HEAD symbolic reference
        local_repo
            .reference_symbolic(
                "refs/remotes/origin/HEAD",
                "refs/remotes/origin/master",
                true,
                "test",
            )
            .expect("create origin/HEAD");

        // Verify list_branches does NOT include origin/HEAD
        let refreshed_branches = local_core_repo.list_branches(None).expect("list branches");
        assert!(
            !refreshed_branches
                .iter()
                .any(|b| b.name == "origin/HEAD" || b.name.ends_with("/HEAD")),
            "origin/HEAD should not be in list_branches"
        );

        // Verify get_commits does NOT include origin/HEAD in branch_refs
        let commits = local_core_repo.get_commits(10).expect("get_commits");
        for commit in commits {
            assert!(
                !commit
                    .branch_refs
                    .iter()
                    .any(|r| r == "origin/HEAD" || r.ends_with("/HEAD")),
                "origin/HEAD should not be in commit branch_refs"
            );
        }
    }

    #[test]
    fn manages_stashes_and_selected_file_shelves() {
        let dir = tempdir().expect("tempdir");
        let repo_path = dir.path().join("repo");
        fs::create_dir(&repo_path).expect("repo dir");
        let repo = Repository::init(&repo_path).expect("init");
        {
            let mut config = repo.config().expect("config");
            config.set_str("user.name", "Test").expect("user name");
            config
                .set_str("user.email", "test@example.com")
                .expect("user email");
        }
        fs::write(repo_path.join("one.txt"), "one\n").expect("one");
        fs::write(repo_path.join("two.txt"), "two\n").expect("two");
        let mut index = repo.index().expect("index");
        index
            .add_all(["*"], git2::IndexAddOption::DEFAULT, None)
            .expect("add");
        let tree_id = index.write_tree().expect("tree");
        index.write().expect("index write");
        let tree = repo.find_tree(tree_id).expect("tree object");
        let signature = git2::Signature::now("Test", "test@example.com").expect("signature");
        repo.commit(Some("HEAD"), &signature, &signature, "base", &tree, &[])
            .expect("commit");
        drop(tree);
        drop(index);
        drop(repo);

        fs::write(repo_path.join("one.txt"), "changed one\n").expect("change one");
        fs::write(repo_path.join("two.txt"), "changed two\n").expect("change two");
        let path = repo_path.to_str().unwrap();
        GitService::create_shelf(path, "only one", &["one.txt".into()]).expect("shelf");
        assert_eq!(
            fs::read_to_string(repo_path.join("one.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "one\n"
        );
        assert_eq!(
            fs::read_to_string(repo_path.join("two.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "changed two\n"
        );

        let mut opened = GitService::open(path).expect("open");
        let shelves = opened.list_stashes().expect("list");
        assert_eq!(shelves.len(), 1);
        assert!(shelves[0].message.contains("[Shelf] only one"));
        let changes = GitService::get_stash_changes(path, &shelves[0].commit_id).expect("changes");
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].path, "one.txt");

        GitService::rename_stash(path, 0, "renamed shelf").expect("rename");
        let mut opened = GitService::open(path).expect("reopen");
        assert!(opened.list_stashes().expect("list renamed")[0]
            .message
            .contains("renamed shelf"));
        GitService::apply_stash(path, 0).expect("apply keep");
        assert_eq!(
            fs::read_to_string(repo_path.join("one.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "changed one\n"
        );
        GitService::drop_stash(path, 0).expect("drop");
        assert!(GitService::open(path)
            .unwrap()
            .list_stashes()
            .unwrap()
            .is_empty());
    }

    #[test]
    fn supports_commit_templates_amend_and_pre_commit_commands() {
        let dir = tempdir().expect("tempdir");
        let repo_path = dir.path().join("repo");
        fs::create_dir(&repo_path).expect("repo dir");
        let repo = Repository::init(&repo_path).expect("init");
        fs::write(
            repo_path.join("commit-template.txt"),
            "type: summary\n\nDetails\n",
        )
        .expect("template");
        repo.config()
            .expect("config")
            .set_str("commit.template", "commit-template.txt")
            .expect("set template");
        fs::write(repo_path.join("file.txt"), "one\n").expect("file");
        let mut index = repo.index().expect("index");
        index
            .add_path(std::path::Path::new("file.txt"))
            .expect("stage");
        index.write().expect("write index");
        drop(index);
        drop(repo);
        let path = repo_path.to_str().unwrap();

        assert_eq!(
            GitService::get_commit_template(path).unwrap().as_deref(),
            Some("type: summary\n\nDetails\n")
        );
        let first = GitService::create_commit_advanced(
            path,
            "first",
            "Test",
            "test@example.com",
            false,
            false,
            Some("git --version"),
        )
        .expect("commit");
        let amended = GitService::create_commit_advanced(
            path,
            "amended",
            "Test",
            "test@example.com",
            true,
            false,
            None,
        )
        .expect("amend");
        assert_ne!(first, amended);
        let repo = GitService::open(path).expect("open");
        assert_eq!(
            repo.inner()
                .head()
                .unwrap()
                .peel_to_commit()
                .unwrap()
                .summary(),
            Some("amended")
        );

        fs::write(repo_path.join("file.txt"), "two\n").expect("update");
        let mut index = repo.inner().index().expect("index");
        index
            .add_path(std::path::Path::new("file.txt"))
            .expect("stage");
        index.write().expect("write");
        drop(index);
        assert!(GitService::create_commit_advanced(
            path,
            "blocked",
            "Test",
            "test@example.com",
            false,
            false,
            Some("git definitely-not-a-command")
        )
        .is_err());
        assert_eq!(GitService::resolve_revision(path, "HEAD").unwrap(), amended);
    }

    #[test]
    fn executes_interactive_rebase_plan_with_reorder_reword_fixup_and_drop() {
        fn commit_file(
            repo: &Repository,
            root: &std::path::Path,
            file: &str,
            message: &str,
        ) -> git2::Oid {
            fs::write(root.join(file), format!("{message}\n")).expect("write file");
            let mut index = repo.index().expect("index");
            index.add_path(std::path::Path::new(file)).expect("stage");
            index.write().expect("write index");
            let tree_id = index.write_tree().expect("tree");
            let tree = repo.find_tree(tree_id).expect("tree");
            let signature = git2::Signature::now("Test", "test@example.com").expect("signature");
            let parent = repo.head().ok().and_then(|head| head.peel_to_commit().ok());
            let parents: Vec<&git2::Commit<'_>> = parent.iter().collect();
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

        let dir = tempdir().expect("tempdir");
        let repo_path = dir.path().join("repo");
        fs::create_dir(&repo_path).expect("repo dir");
        let repo = Repository::init(&repo_path).expect("init");
        repo.config().unwrap().set_str("user.name", "Test").unwrap();
        repo.config()
            .unwrap()
            .set_str("user.email", "test@example.com")
            .unwrap();
        let base = commit_file(&repo, &repo_path, "base.txt", "base");
        let a = commit_file(&repo, &repo_path, "a.txt", "A");
        let b = commit_file(&repo, &repo_path, "b.txt", "B");
        let c = commit_file(&repo, &repo_path, "c.txt", "C");
        let d = commit_file(&repo, &repo_path, "d.txt", "D");
        drop(repo);
        let path = repo_path.to_str().unwrap();
        let candidates = GitService::get_interactive_rebase_commits(path, &base.to_string())
            .expect("candidates");
        assert_eq!(candidates.len(), 4);
        let plan = vec![
            super::RebasePlanItem {
                commit_id: b.to_string(),
                action: "reword".into(),
                message: Some("B rewritten".into()),
            },
            super::RebasePlanItem {
                commit_id: a.to_string(),
                action: "pick".into(),
                message: None,
            },
            super::RebasePlanItem {
                commit_id: c.to_string(),
                action: "fixup".into(),
                message: None,
            },
            super::RebasePlanItem {
                commit_id: d.to_string(),
                action: "drop".into(),
                message: None,
            },
        ];
        GitService::interactive_rebase(path, &base.to_string(), &plan).expect("interactive rebase");
        let repo = Repository::open(path).expect("open");
        let mut walk = repo.revwalk().unwrap();
        walk.push_head().unwrap();
        walk.hide(base).unwrap();
        let commits: Vec<_> = walk
            .map(|id| {
                repo.find_commit(id.unwrap())
                    .unwrap()
                    .summary()
                    .unwrap()
                    .to_string()
            })
            .collect();
        assert_eq!(commits.len(), 2);
        assert!(commits.iter().any(|message| message == "B rewritten"));
        assert!(repo_path.join("a.txt").exists());
        assert!(repo_path.join("b.txt").exists());
        assert!(repo_path.join("c.txt").exists());
        assert!(!repo_path.join("d.txt").exists());
    }

    #[test]
    fn reports_incoming_outgoing_and_rejects_diverged_fast_forward_pull() {
        fn commit_tree(
            repo: &Repository,
            parent: git2::Oid,
            file: &str,
            message: &str,
        ) -> git2::Oid {
            let parent_commit = repo.find_commit(parent).unwrap();
            let mut index = repo.index().unwrap();
            index.read_tree(&parent_commit.tree().unwrap()).unwrap();
            let blob = repo.blob(message.as_bytes()).unwrap();
            index
                .add(&git2::IndexEntry {
                    ctime: git2::IndexTime::new(0, 0),
                    mtime: git2::IndexTime::new(0, 0),
                    dev: 0,
                    ino: 0,
                    mode: 0o100644,
                    uid: 0,
                    gid: 0,
                    file_size: message.len() as u32,
                    id: blob,
                    flags: 0,
                    flags_extended: 0,
                    path: file.as_bytes().to_vec(),
                })
                .unwrap();
            let tree_id = index.write_tree_to(repo).unwrap();
            let tree = repo.find_tree(tree_id).unwrap();
            let sig = git2::Signature::now("Test", "test@example.com").unwrap();
            repo.commit(None, &sig, &sig, message, &tree, &[&parent_commit])
                .unwrap()
        }
        let dir = tempdir().unwrap();
        let repo_path = dir.path().join("repo");
        fs::create_dir(&repo_path).unwrap();
        let repo = Repository::init(&repo_path).unwrap();
        repo.set_head("refs/heads/main").unwrap();
        fs::write(repo_path.join("base.txt"), "base\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("base.txt")).unwrap();
        let tree_id = index.write_tree().unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = git2::Signature::now("Test", "test@example.com").unwrap();
        let base = repo
            .commit(Some("HEAD"), &sig, &sig, "base", &tree, &[])
            .unwrap();
        drop(tree);
        drop(index);
        let local = commit_tree(&repo, base, "local.txt", "local");
        repo.reference("refs/heads/main", local, true, "local tip")
            .unwrap();
        let remote = commit_tree(&repo, base, "remote.txt", "remote");
        repo.remote("origin", repo_path.to_str().unwrap()).unwrap();
        repo.reference("refs/remotes/origin/main", remote, true, "remote tip")
            .unwrap();
        let mut config = repo.config().unwrap();
        config.set_str("branch.main.remote", "origin").unwrap();
        config
            .set_str("branch.main.merge", "refs/heads/main")
            .unwrap();
        drop(config);
        drop(repo);
        let path = repo_path.to_str().unwrap();
        let status = GitService::get_sync_status(path).expect("sync status");
        assert_eq!(status.incoming.len(), 1);
        assert_eq!(status.outgoing.len(), 1);
        assert_eq!(status.incoming[0].summary, "remote");
        assert_eq!(status.outgoing[0].summary, "local");
        assert!(GitService::pull_with_strategy(path, "origin", "ff-only").is_err());
    }

    #[test]
    fn lists_locks_unlocks_and_removes_worktrees() {
        let dir = tempdir().unwrap();
        let repo_path = dir.path().join("repo");
        let worktree_path = dir.path().join("feature-worktree");
        fs::create_dir(&repo_path).unwrap();
        let repo = Repository::init(&repo_path).unwrap();
        fs::write(repo_path.join("base.txt"), "base\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("base.txt")).unwrap();
        let tree_id = index.write_tree().unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = git2::Signature::now("Test", "test@example.com").unwrap();
        let commit_id = repo
            .commit(Some("HEAD"), &sig, &sig, "base", &tree, &[])
            .unwrap();
        let commit = repo.find_commit(commit_id).unwrap();
        repo.branch("feature", &commit, false).unwrap();
        drop(commit);
        drop(tree);
        drop(index);
        drop(repo);
        let path = repo_path.to_str().unwrap();
        let secondary = worktree_path.to_str().unwrap();
        GitService::worktree(path, secondary, "feature").expect("add worktree");
        let worktrees = GitService::list_worktrees(path).expect("list");
        assert_eq!(worktrees.len(), 2);
        assert!(worktrees.iter().any(|item| item.is_main));
        let listed_secondary = worktrees
            .iter()
            .find(|item| item.branch.as_deref() == Some("feature"))
            .expect("feature worktree")
            .path
            .clone();
        GitService::set_worktree_locked(path, &listed_secondary, true, Some("test lock"))
            .expect("lock");
        assert!(
            GitService::list_worktrees(path)
                .unwrap()
                .iter()
                .find(|item| item.path == listed_secondary)
                .unwrap()
                .is_locked
        );
        GitService::set_worktree_locked(path, &listed_secondary, false, None).expect("unlock");
        GitService::remove_worktree(path, &listed_secondary, false).expect("remove");
        assert_eq!(GitService::list_worktrees(path).unwrap().len(), 1);
        assert!(!worktree_path.exists());
    }

    #[test]
    fn discovers_nested_roots_builds_review_urls_and_restores_local_history() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("workspace");
        let nested = root.join("packages").join("nested");
        fs::create_dir_all(&nested).unwrap();
        let repo = Repository::init(&root).unwrap();
        Repository::init(&nested).unwrap();
        repo.remote("origin", "git@github.com:example/project.git")
            .unwrap();
        fs::write(root.join("file.txt"), "version one\n").unwrap();
        let path = root.to_str().unwrap();

        let roots = GitService::discover_git_roots(path).expect("discover roots");
        assert_eq!(roots.len(), 2);
        assert_eq!(
            GitService::pull_request_url(path, "main", "feature").unwrap(),
            "https://github.com/example/project/compare/main...feature?expand=1"
        );

        let first =
            GitService::create_local_history_snapshot(path, "file.txt", "first").expect("snapshot");
        fs::write(root.join("file.txt"), "version two\n").unwrap();
        let second = GitService::create_local_history_snapshot(path, "file.txt", "second")
            .expect("snapshot two");
        let history = GitService::list_local_history(path, "file.txt").expect("history");
        assert_eq!(history.len(), 2);
        assert_eq!(
            GitService::read_local_history(path, "file.txt", &first.id).unwrap(),
            "version one\n"
        );
        GitService::restore_local_history(path, "file.txt", &first.id).expect("restore");
        assert_eq!(
            fs::read_to_string(root.join("file.txt")).unwrap(),
            "version one\n"
        );
        assert!(
            GitService::list_local_history(path, "file.txt")
                .unwrap()
                .len()
                >= 3
        );
        assert_ne!(first.id, second.id);
    }
}
