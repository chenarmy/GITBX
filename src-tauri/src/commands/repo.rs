use gitbx_core::{
    BranchItem, GitService, RemoteItem, RepoStatusSummary, RepositoryInfo, StashItem, TagItem,
};

type CommandResult<T> = std::result::Result<T, String>;

#[tauri::command]
pub async fn init_repo(repo_path: String) -> CommandResult<RepositoryInfo> {
    let repo = git2::Repository::init(&repo_path).map_err(|e| e.to_string())?;
    let path = repo
        .path()
        .parent()
        .unwrap_or(repo.path())
        .to_string_lossy()
        .to_string();
    GitService::info(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clone_repo(url: String, destination: String) -> CommandResult<RepositoryInfo> {
    GitService::clone_repo(&url, &destination).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_repo_info(repo_path: String) -> CommandResult<RepositoryInfo> {
    GitService::info(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_repo_status(repo_path: String) -> CommandResult<RepoStatusSummary> {
    GitService::open(&repo_path)
        .map_err(|e| e.to_string())?
        .get_status()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_branches(repo_path: String) -> CommandResult<Vec<BranchItem>> {
    GitService::open(&repo_path)
        .map_err(|e| e.to_string())?
        .list_branches(None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_remotes(repo_path: String) -> CommandResult<Vec<RemoteItem>> {
    GitService::open(&repo_path)
        .map_err(|e| e.to_string())?
        .list_remotes()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_remote_url(
    repo_path: String,
    remote_name: String,
    url: String,
    push_url: Option<String>,
) -> CommandResult<()> {
    GitService::set_remote_urls(&repo_path, &remote_name, &url, push_url.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stage_file(repo_path: String, file_path: String) -> CommandResult<()> {
    GitService::with_write_lock(&repo_path, |repo| {
        GitService::validate_file_path(&repo_path, &file_path)?;
        repo.stage_file(&file_path)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn unstage_file(repo_path: String, file_path: String) -> CommandResult<()> {
    GitService::validate_file_path(&repo_path, &file_path).map_err(|e| e.to_string())?;
    GitService::with_write_lock(&repo_path, |repo| repo.unstage_file(&file_path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stage_all(repo_path: String) -> CommandResult<()> {
    GitService::with_write_lock(&repo_path, |repo| repo.stage_all()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn unstage_all(repo_path: String) -> CommandResult<()> {
    GitService::with_write_lock(&repo_path, |repo| repo.unstage_all()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn discard_file(repo_path: String, file_path: Option<String>) -> CommandResult<()> {
    GitService::discard_file(&repo_path, file_path.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_commit(
    repo_path: String,
    message: String,
    author: String,
    email: String,
) -> CommandResult<String> {
    GitService::with_write_lock(&repo_path, |repo| {
        repo.create_commit(&message, &author, &email)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn commit_and_push(
    repo_path: String,
    message: String,
    author: String,
    email: String,
) -> CommandResult<String> {
    GitService::commit_and_push(&repo_path, &message, &author, &email).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn checkout_branch(repo_path: String, branch_name: String) -> CommandResult<()> {
    GitService::with_write_lock(&repo_path, |repo| repo.checkout_branch(&branch_name))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_branch(
    repo_path: String,
    name: String,
    target_commit_id: Option<String>,
    checkout: Option<bool>,
) -> CommandResult<()> {
    GitService::create_branch(
        &repo_path,
        &name,
        target_commit_id.as_deref(),
        checkout.unwrap_or(true),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_branch(
    repo_path: String,
    name: String,
    force: Option<bool>,
) -> CommandResult<()> {
    GitService::delete_branch(&repo_path, &name, force.unwrap_or(false)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_branch(
    repo_path: String,
    old_name: String,
    new_name: String,
) -> CommandResult<()> {
    GitService::rename_branch(&repo_path, &old_name, &new_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_tags(repo_path: String) -> CommandResult<Vec<TagItem>> {
    GitService::open(&repo_path)
        .map_err(|e| e.to_string())?
        .list_tags()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_tag(
    repo_path: String,
    name: String,
    message: Option<String>,
    commit_id: Option<String>,
) -> CommandResult<()> {
    GitService::create_tag(&repo_path, &name, message.as_deref(), commit_id.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_stashes(repo_path: String) -> CommandResult<Vec<StashItem>> {
    let mut repo = GitService::open(&repo_path).map_err(|e| e.to_string())?;
    repo.list_stashes().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_stash(repo_path: String, message: Option<String>) -> CommandResult<()> {
    GitService::create_stash(&repo_path, message.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pop_stash(repo_path: String, index: Option<usize>) -> CommandResult<()> {
    GitService::pop_stash(&repo_path, index.unwrap_or(0)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reset(repo_path: String, target: String, mode: String) -> CommandResult<()> {
    GitService::reset(&repo_path, &target, &mode).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn merge(
    repo_path: String,
    target: String,
    strategy: Option<String>,
) -> CommandResult<()> {
    GitService::merge(&repo_path, &target, strategy.as_deref() == Some("no-ff"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn merge_abort(repo_path: String) -> CommandResult<()> {
    GitService::abort_merge(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn merge_continue(repo_path: String) -> CommandResult<String> {
    GitService::continue_merge(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cherry_pick(repo_path: String, commit_id: String) -> CommandResult<()> {
    GitService::cherry_pick(&repo_path, &commit_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cherry_pick_continue(repo_path: String) -> CommandResult<String> {
    GitService::continue_cherry_pick(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn revert(repo_path: String, commit_id: String) -> CommandResult<()> {
    GitService::revert(&repo_path, &commit_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn revert_continue(repo_path: String) -> CommandResult<String> {
    GitService::continue_revert(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_commit_changes(
    repo_path: String,
    commit_id: String,
) -> CommandResult<Vec<gitbx_core::FileStatusItem>> {
    GitService::get_commit_changes(&repo_path, &commit_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_remote(repo_path: String, remote_name: Option<String>) -> CommandResult<()> {
    if remote_name.is_some() {
        GitService::with_write_lock(&repo_path, |repo| {
            repo.fetch_remote(remote_name.as_deref().unwrap_or("origin"))
        })
        .map_err(|e| e.to_string())
    } else {
        GitService::fetch_all(&repo_path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn pull(repo_path: String) -> CommandResult<()> {
    GitService::pull(&repo_path, "origin").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn push(repo_path: String) -> CommandResult<()> {
    GitService::push(&repo_path, "origin").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rebase(repo_path: String, upstream: String) -> CommandResult<()> {
    GitService::rebase(&repo_path, &upstream).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rebase_continue(repo_path: String) -> CommandResult<()> {
    GitService::continue_rebase(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn operation_abort(repo_path: String) -> CommandResult<()> {
    GitService::abort_operation(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn worktree_add(
    repo_path: String,
    destination: String,
    branch: String,
) -> CommandResult<()> {
    GitService::worktree(&repo_path, &destination, &branch).map_err(|e| e.to_string())
}
