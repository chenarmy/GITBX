use crate::api::AppState;
use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    response::IntoResponse,
    routing::get,
    Router,
};
use gitbx_core::GitService;
use serde_json::json;
use std::sync::Arc;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/ws", get(ws_handler))
        .with_state(state)
}

async fn ws_handler(State(state): State<Arc<AppState>>, ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, Some(state)))
}

async fn handle_socket(mut socket: WebSocket, _state: Option<Arc<AppState>>) {
    let mut repo_path: Option<String> = None;
    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(2));
    loop {
        tokio::select! {
            message = socket.recv() => {
                let Some(Ok(Message::Text(text))) = message else { break; };
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                    repo_path = value.get("repo_path").and_then(|v| v.as_str()).map(ToOwned::to_owned);
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
