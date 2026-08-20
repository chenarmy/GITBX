mod api;
mod ws;

use api::AppState;
use axum::http::{HeaderValue, Method};
use axum::Router;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let state = Arc::new(AppState::from_env());
    if state.auth_token.is_none() {
        tracing::warn!(
            "GITBX_WEB_TOKEN is not set; Web API authentication is disabled for local development"
        );
    }
    if state.allowed_roots.is_empty() {
        tracing::warn!("GITBX_ALLOWED_REPOS is not set; Web API repository allowlist is disabled");
    }
    let app = Router::new()
        .merge(api::router(state.clone()))
        .merge(ws::router(state.clone()))
        .layer(
            CorsLayer::new()
                .allow_origin([
                    HeaderValue::from_static("http://localhost:5173"),
                    HeaderValue::from_static("http://127.0.0.1:5173"),
                ])
                .allow_methods([Method::GET, Method::POST, Method::OPTIONS]),
        )
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    tracing::info!("GITBX Web Server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
