use crate::api::AppState;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use gitbx_core::GitService;
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

#[derive(Deserialize)]
struct WsQuery {
    token: Option<String>,
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/ws", get(ws_handler))
        .with_state(state)
}

async fn ws_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<WsQuery>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    if !state.authorized_token(query.token.as_deref(), &headers) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    }
    ws.on_upgrade(move |socket| handle_socket(socket, state))
        .into_response()
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    let mut repo_path: Option<String> = None;
    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(2));
    loop {
        tokio::select! {
            message = socket.recv() => {
                let Some(Ok(Message::Text(text))) = message else { break; };
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(path) = value.get("repo_path").and_then(|v| v.as_str()) {
                        if state.allowed(path) {
                            repo_path = Some(path.to_string());
                        } else {
                            let payload = json!({ "type": "error", "message": "Repository is outside the configured allowlist" });
                            let _ = socket.send(Message::Text(payload.to_string())).await;
                            repo_path = None;
                        }
                    }
                }
            }
            _ = ticker.tick(), if repo_path.is_some() => {
                if let Some(path) = &repo_path {
                    let payload = match GitService::open(path).and_then(|repo| Ok((repo.info()?, repo.get_status()?))) {
                        Ok((info, status)) => json!({ "type": "repo_snapshot", "info": info, "status": status }),
                        Err(error) => json!({ "type": "error", "message": error.to_string() }),
                    };
                    if socket.send(Message::Text(payload.to_string())).await.is_err() { break; }
                }
            }
        }
    }
}
