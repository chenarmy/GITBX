use axum::{
    body::Bytes,
    extract::{OriginalUri, State},
    http::{HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{any, get, post},
    Json, Router,
};
use gitbx_ai::{CommitGenerator, GenericOpenAiClient, LlmConfig};
use gitbx_contracts::GitErrorResponse;
use gitbx_core::{GitService, GitbxError};
use gitbx_diff::DiffEngine;
use gitbx_graph::GraphLayoutEngine;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub allowed_roots: Vec<PathBuf>,
    pub auth_token: Option<String>,
}

impl AppState {
    pub fn from_env() -> Self {
        let allowed_roots = std::env::var("GITBX_ALLOWED_REPOS")
            .unwrap_or_default()
            .split(';')
            .filter(|value| !value.trim().is_empty())
            .filter_map(|value| Path::new(value.trim()).canonicalize().ok())
            .collect();
        let auth_token = std::env::var("GITBX_WEB_TOKEN")
            .ok()
            .filter(|value| !value.is_empty());
        Self {
            allowed_roots,
            auth_token,
        }
    }

    fn authorized(&self, headers: &HeaderMap) -> bool {
        match &self.auth_token {
            Some(expected) => headers
                .get("authorization")
                .and_then(|value| value.to_str().ok())
                .map(|value| value == format!("Bearer {expected}"))
                .unwrap_or(false),
            None => true,
        }
    }

    fn allowed(&self, repo_path: &str) -> bool {
        if self.allowed_roots.is_empty() {
            return true;
        }
        let Some(path) = canonicalize_for_policy(Path::new(repo_path)) else {
            return false;
        };
        self.allowed_roots.iter().any(|root| path.starts_with(root))
    }
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/ai/commit", post(ai_commit))
        .route("/api/repo/*path", any(repo_handler))
        .with_state(state)
}

async fn health() -> impl IntoResponse {
    Json(json!({ "ok": true, "service": "gitbx-web" }))
}

async fn ai_commit(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    if !state.authorized(&headers) {
        return error_response(
            StatusCode::UNAUTHORIZED,
            GitErrorResponse::new("UNAUTHORIZED", "Authentication required"),
        );
    }
    let diff = body.get("diff_text").and_then(Value::as_str).unwrap_or("");
    if diff.trim().is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            GitErrorResponse::new(
                "AI_DIFF_EMPTY",
                "No staged diff is available for commit message generation",
            ),
        );
    }
    let config = body
        .get("config")
        .cloned()
        .and_then(|value| serde_json::from_value::<LlmConfig>(value).ok())
        .unwrap_or_default();
    match CommitGenerator::generate_from_diff(&GenericOpenAiClient::new(config), diff).await {
        Ok(value) => (StatusCode::OK, Json(json!(value))).into_response(),
        Err(error) => error_response(
            StatusCode::BAD_GATEWAY,
            GitErrorResponse::new("AI_PROVIDER_ERROR", error.to_string()),
        ),
    }
}

fn query(uri: &axum::http::Uri, name: &str) -> Option<String> {
    uri.query()?.split('&').find_map(|pair| {
        let mut parts = pair.splitn(2, '=');
        let key = parts.next()?;
        let value = parts.next().unwrap_or("");
        if key == name {
            Some(percent_decode(value))
        } else {
            None
        }
    })
}

fn percent_decode(value: &str) -> String {
    let mut bytes = Vec::with_capacity(value.len());
    let raw = value.as_bytes();
    let mut index = 0;
    while index < raw.len() {
        if raw[index] == b'%' && index + 2 < raw.len() {
            let high = (raw[index + 1] as char).to_digit(16);
            let low = (raw[index + 2] as char).to_digit(16);
            if let (Some(high), Some(low)) = (high, low) {
                bytes.push((high * 16 + low) as u8);
                index += 3;
                continue;
            }
        }
        bytes.push(if raw[index] == b'+' { b' ' } else { raw[index] });
        index += 1;
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

fn error_response(status: StatusCode, error: GitErrorResponse) -> Response {
    (status, Json(json!({ "error": error }))).into_response()
}

fn git_error(error: GitbxError) -> GitErrorResponse {
    let conflict = matches!(&error, GitbxError::MergeConflict(_));
    let code = match &error {
        GitbxError::MergeConflict(_) => "CONFLICT",
        GitbxError::AuthFailed(_) => "AUTH_FAILED",
        _ => "GIT_ERROR",
    };
    let mut result = GitErrorResponse::new(code, error.to_string());
    result.conflict = conflict;
    result.detail = Some(error.to_string());
    result
}

fn repo_path(body: &Value, uri: &axum::http::Uri) -> Option<String> {
    body.get("repo_path")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| {
            body.get("path")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        })
        .or_else(|| query(uri, "path"))
}

fn canonicalize_for_policy(path: &Path) -> Option<PathBuf> {
    let mut candidate = path.to_path_buf();
    while !candidate.exists() {
        if !candidate.pop() {
            return None;
        }
    }
    candidate.canonicalize().ok()
}

async fn repo_handler(
    State(state): State<Arc<AppState>>,
    OriginalUri(uri): OriginalUri,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !state.authorized(&headers) {
        return error_response(
            StatusCode::UNAUTHORIZED,
            GitErrorResponse::new("UNAUTHORIZED", "Authentication required"),
        );
    }

    let body_json: Value = if body.is_empty() {
        json!({})
    } else {
        serde_json::from_slice(&body).unwrap_or_else(|_| json!({}))
    };
    let endpoint = uri.path().trim_start_matches("/api/repo/");
    let request_path = repo_path(&body_json, &uri).or_else(|| {
        if endpoint == "clone" {
            body_json
                .get("destination")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        } else {
            None
        }
    });
    let Some(path) = request_path else {
        return error_response(
            StatusCode::BAD_REQUEST,
            GitErrorResponse::new("MISSING_REPO_PATH", "repo_path or path is required"),
        );
    };
    if !state.allowed(&path) {
        return error_response(
            StatusCode::FORBIDDEN,
            GitErrorResponse::new(
                "REPO_NOT_ALLOWED",
                "Repository is outside the configured allowlist",
            ),
        );
    }

    let read_repo = || GitService::open(&path);
    let result: Result<Value, GitbxError> = (|| match (method, endpoint) {
        (Method::GET, "info") => read_repo()?.info().map(|value| json!(value)),
        (Method::GET, "status") => read_repo()?.get_status().map(|value| json!(value)),
        (Method::GET, "branches") => read_repo()?.list_branches(None).map(|value| json!(value)),
        (Method::GET, "remotes") => read_repo()?.list_remotes().map(|value| json!(value)),
        (Method::GET, "tags") => read_repo()?.list_tags().map(|value| json!(value)),
        (Method::GET, "stashes") => {
            let mut repo = read_repo()?;
            repo.list_stashes().map(|value| json!(value))
        }
        (Method::GET, "graph") => {
            let repo = read_repo()?;
            let max = query(&uri, "max")
                .and_then(|v| v.parse().ok())
                .unwrap_or(200);
            let commits = repo.get_commits(max)?;
            let info = repo.info()?;
            Ok(json!(GraphLayoutEngine::compute_layout(
                &commits,
                info.head_commit_id.as_deref()
            )))
        }
        (Method::GET, "diff") => diff_response(&path, &uri),
        (Method::POST, "validate") => {
            let target = body_json
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or(&path);
            GitService::info(target)
                .map(|info| json!({ "valid": true, "path": info.path, "name": info.name }))
        }
        (Method::POST, "init") => {
            let target = body_json
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or(&path);
            git2::Repository::init(target).map(|repo| json!({ "success": true, "path": repo.path().parent().unwrap_or(repo.path()).to_string_lossy() })).map_err(GitbxError::from)
        }
        (Method::POST, "clone") => {
            let url = body_json.get("url").and_then(Value::as_str).unwrap_or("");
            let destination = body_json
                .get("destination")
                .and_then(Value::as_str)
                .unwrap_or("");
            git2::build::RepoBuilder::new()
                .clone(url, Path::new(destination))
                .map(|_| json!({ "success": true, "path": destination }))
                .map_err(GitbxError::from)
        }
        (Method::POST, "stage") => write_op(&path, || {
            let file = body_json
                .get("file_path")
                .and_then(Value::as_str)
                .unwrap_or("");
            GitService::validate_file_path(&path, file)?;
            GitService::with_write_lock(&path, |repo| repo.stage_file(file))
        }),
        (Method::POST, "stage-all") => write_op(&path, || {
            GitService::with_write_lock(&path, |repo| repo.stage_all())
        }),
        (Method::POST, "unstage") => write_op(&path, || {
            let file = body_json
                .get("file_path")
                .and_then(Value::as_str)
                .unwrap_or("");
            GitService::validate_file_path(&path, file)?;
            GitService::with_write_lock(&path, |repo| repo.unstage_file(file))
        }),
        (Method::POST, "unstage-all") => write_op(&path, || {
            GitService::with_write_lock(&path, |repo| {
                let mut index = repo.inner().index()?;
                if let Ok(head) = repo.inner().head() {
                    index.read_tree(&head.peel_to_tree()?)?;
                } else {
                    index.clear()?;
                }
                index.write()?;
                Ok(())
            })
        }),
        (Method::POST, "discard") => write_op(&path, || {
            GitService::discard_file(&path, body_json.get("file_path").and_then(Value::as_str))
        }),
        (Method::POST, "commit") => write_op(&path, || {
            let message = body_json
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("");
            let author = body_json
                .get("author")
                .and_then(Value::as_str)
                .unwrap_or("GITBX");
            let email = body_json
                .get("email")
                .and_then(Value::as_str)
                .unwrap_or("gitbx@localhost");
            GitService::with_write_lock(&path, |repo| {
                repo.create_commit(message, author, email)
                    .map(|commit_id| json!({ "success": true, "commit_id": commit_id }))
            })
        }),
        (Method::POST, "branch/create") => write_op(&path, || {
            GitService::create_branch(
                &path,
                body_json.get("name").and_then(Value::as_str).unwrap_or(""),
                body_json.get("start_point").and_then(Value::as_str),
                body_json
                    .get("checkout")
                    .and_then(Value::as_bool)
                    .unwrap_or(true),
            )
        }),
        (Method::POST, "branch/delete") => write_op(&path, || {
            GitService::delete_branch(
                &path,
                body_json.get("name").and_then(Value::as_str).unwrap_or(""),
                body_json
                    .get("force")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            )
        }),
        (Method::POST, "branch/rename") => write_op(&path, || {
            GitService::rename_branch(
                &path,
                body_json
                    .get("old_name")
                    .and_then(Value::as_str)
                    .unwrap_or(""),
                body_json
                    .get("new_name")
                    .and_then(Value::as_str)
                    .unwrap_or(""),
            )
        }),
        (Method::POST, "branch/checkout") => write_op(&path, || {
            let name = body_json.get("name").and_then(Value::as_str).unwrap_or("");
            GitService::with_write_lock(&path, |repo| repo.checkout_branch(name))
        }),
        (Method::POST, "remote/set-url") => write_op(&path, || {
            let name = body_json
                .get("remote_name")
                .and_then(Value::as_str)
                .unwrap_or("");
            let url = body_json.get("url").and_then(Value::as_str).unwrap_or("");
            let push_url = body_json.get("push_url").and_then(Value::as_str);
            GitService::set_remote_urls(&path, name, url, push_url)
        }),
        (Method::POST, "tag/create") => write_op(&path, || {
            GitService::create_tag(
                &path,
                body_json.get("name").and_then(Value::as_str).unwrap_or(""),
                body_json.get("message").and_then(Value::as_str),
                body_json.get("commit_id").and_then(Value::as_str),
            )
        }),
        (Method::POST, "stash/create") => write_op(&path, || {
            GitService::create_stash(&path, body_json.get("message").and_then(Value::as_str))
        }),
        (Method::POST, "stash/pop") => write_op(&path, || {
            GitService::pop_stash(
                &path,
                body_json.get("index").and_then(Value::as_u64).unwrap_or(0) as usize,
            )
        }),
        (Method::POST, "reset") => write_op(&path, || {
            GitService::reset(
                &path,
                body_json
                    .get("target")
                    .and_then(Value::as_str)
                    .unwrap_or("HEAD"),
                body_json
                    .get("mode")
                    .and_then(Value::as_str)
                    .unwrap_or("--mixed"),
            )
        }),
        (Method::POST, "merge") => write_op(&path, || {
            GitService::merge(
                &path,
                body_json
                    .get("target")
                    .and_then(Value::as_str)
                    .unwrap_or(""),
                body_json.get("strategy").and_then(Value::as_str) == Some("no-ff"),
            )
        }),
        (Method::POST, "merge/abort") => write_op(&path, || {
            GitService::with_write_lock(&path, |repo| Ok(repo.inner_mut().cleanup_state()?))
        }),
        (Method::POST, "merge/continue") => write_op(&path, || GitService::continue_merge(&path)),
        (Method::POST, "cherry-pick") => write_op(&path, || {
            GitService::cherry_pick(
                &path,
                body_json
                    .get("commit_id")
                    .and_then(Value::as_str)
                    .unwrap_or(""),
            )
        }),
        (Method::POST, "revert") => write_op(&path, || {
            GitService::revert(
                &path,
                body_json
                    .get("commit_id")
                    .and_then(Value::as_str)
                    .unwrap_or(""),
            )
        }),
        (Method::POST, "fetch") => write_op(&path, || GitService::fetch_all(&path)),
        (Method::POST, "pull") => write_op(&path, || GitService::pull(&path, "origin")),
        (Method::POST, "push") => write_op(&path, || GitService::push(&path, "origin")),
        (Method::POST, "rebase") => write_op(&path, || {
            GitService::rebase(
                &path,
                body_json
                    .get("upstream")
                    .and_then(Value::as_str)
                    .unwrap_or("HEAD"),
            )
        }),
        (Method::POST, "rebase/continue") => write_op(&path, || GitService::continue_rebase(&path)),
        (Method::POST, "cherry-pick/continue") => {
            write_op(&path, || GitService::continue_cherry_pick(&path))
        }
        (Method::POST, "rebase/abort") | (Method::POST, "cherry-pick/abort") => {
            write_op(&path, || GitService::abort_operation(&path))
        }
        (Method::POST, "worktree/add") => write_op(&path, || {
            GitService::worktree(
                &path,
                body_json
                    .get("dest_path")
                    .and_then(Value::as_str)
                    .unwrap_or(""),
                body_json
                    .get("branch")
                    .and_then(Value::as_str)
                    .unwrap_or(""),
            )
        }),
        _ => Err(GitbxError::General("Endpoint not found".into())),
    })();

    match result {
        Ok(value) => (StatusCode::OK, Json(value)).into_response(),
        Err(error) => {
            let status = match &error {
                GitbxError::AuthFailed(_) => StatusCode::UNAUTHORIZED,
                _ if endpoint == "not-found" => StatusCode::NOT_FOUND,
                _ => StatusCode::BAD_REQUEST,
            };
            error_response(status, git_error(error))
        }
    }
}

fn write_op<T>(
    _path: &str,
    operation: impl FnOnce() -> Result<T, GitbxError>,
) -> Result<Value, GitbxError>
where
    T: serde::Serialize,
{
    let value = operation()?;
    let serialized =
        serde_json::to_value(&value).map_err(|error| GitbxError::General(error.to_string()))?;
    if serialized.is_null() {
        Ok(json!({ "success": true }))
    } else if serialized.is_object() && serialized.get("success").is_some() {
        Ok(serialized)
    } else {
        Ok(json!({ "success": true, "value": serialized }))
    }
}

fn diff_response(path: &str, uri: &axum::http::Uri) -> Result<Value, GitbxError> {
    let file = query(uri, "file").unwrap_or_default();
    if file.is_empty() {
        return Ok(json!({ "raw_diff": "", "file": file }));
    }
    GitService::validate_file_path(path, &file)?;
    let repo = GitService::open(path)?;
    let staged = query(uri, "staged").as_deref() == Some("true");
    let commit_id = query(uri, "commit");
    let (old, new) = if let Some(commit_id) = commit_id {
        let commit = repo.inner().find_commit(git2::Oid::from_str(&commit_id)?)?;
        let old = commit
            .parent(0)
            .ok()
            .and_then(|parent| parent.tree().ok()?.get_path(Path::new(&file)).ok())
            .and_then(|entry| repo.inner().find_blob(entry.id()).ok())
            .map(|blob| blob.content().to_vec())
            .unwrap_or_default();
        let new = commit
            .tree()
            .ok()
            .and_then(|tree| tree.get_path(Path::new(&file)).ok())
            .and_then(|entry| repo.inner().find_blob(entry.id()).ok())
            .map(|blob| blob.content().to_vec())
            .unwrap_or_default();
        (old, new)
    } else if staged {
        let old = repo
            .inner()
            .head()
            .ok()
            .and_then(|head| head.peel_to_commit().ok())
            .and_then(|commit| commit.tree().ok()?.get_path(Path::new(&file)).ok())
            .and_then(|entry| repo.inner().find_blob(entry.id()).ok())
            .map(|blob| blob.content().to_vec())
            .unwrap_or_default();
        (old, repo.index_file(&file).unwrap_or_default())
    } else {
        (
            repo.index_file(&file).unwrap_or_default(),
            repo.workdir_file(&file).unwrap_or_default(),
        )
    };
    if std::str::from_utf8(&old).is_err() || std::str::from_utf8(&new).is_err() {
        return Ok(
            json!({ "old_path": file, "new_path": file, "is_binary": true, "hunks": [], "additions": 0, "deletions": 0 }),
        );
    }
    serde_json::to_value(DiffEngine::diff_strings(
        &String::from_utf8_lossy(&old),
        &String::from_utf8_lossy(&new),
        Some(&file),
        Some(&file),
    ))
    .map_err(|error| GitbxError::General(error.to_string()))
}
