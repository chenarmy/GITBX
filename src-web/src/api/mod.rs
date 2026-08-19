use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use gitbx_core::open_repo;
use gitbx_graph::GraphLayoutEngine;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {}

#[derive(Deserialize)]
pub struct RepoQuery {
    pub path: String,
}

#[derive(Deserialize)]
pub struct StageFileBody {
    pub repo_path: String,
    pub file_path: String,
}

#[derive(Deserialize)]
pub struct CommitBody {
    pub repo_path: String,
    pub message: String,
    pub author: String,
    pub email: String,
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/repo/info", get(get_repo_info))
        .route("/api/repo/status", get(get_repo_status))
        .route("/api/repo/branches", get(list_branches))
        .route("/api/repo/graph", get(get_graph))
        .route("/api/repo/stage", post(stage_file))
        .route("/api/repo/commit", post(create_commit))
        .with_state(state)
}

async fn get_repo_info(Query(q): Query<RepoQuery>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let repo = open_repo(&q.path).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    let info = repo.info().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(info))
}

async fn get_repo_status(Query(q): Query<RepoQuery>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let repo = open_repo(&q.path).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    let status = repo.get_status().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(status))
}

async fn list_branches(Query(q): Query<RepoQuery>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let repo = open_repo(&q.path).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    let branches = repo.list_branches(None).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(branches))
}

async fn get_graph(Query(q): Query<RepoQuery>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let repo = open_repo(&q.path).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    let commits = repo.get_commits(200).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let info = repo.info().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let graph = GraphLayoutEngine::compute_layout(&commits, info.head_commit_id.as_deref());
    Ok(Json(graph))
}

async fn stage_file(Json(body): Json<StageFileBody>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let repo = open_repo(&body.repo_path).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    repo.stage_file(&body.file_path).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn create_commit(Json(body): Json<CommitBody>) -> Result<impl IntoResponse, (StatusCode, String)> {
    let repo = open_repo(&body.repo_path).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    let oid = repo.create_commit(&body.message, &body.author, &body.email)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({ "success": true, "commit_id": oid })))
}
