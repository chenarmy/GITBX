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
            "GITBX_WEB_TOKEN is not set; Web API will reject authenticated endpoints (fail-closed)"
        );
    }
    if state.allowed_roots.is_empty() {
        if state.open_mode {
            tracing::warn!(
                "GITBX_ALLOWED_REPOS is not set, but open mode is explicitly enabled (GITBX_ALLOW_ALL_REPOS/GITBX_OPEN_MODE); all repositories allowed"
            );
        } else {
            tracing::warn!(
                "GITBX_ALLOWED_REPOS is not set and open mode is disabled; Web API will reject repository access (fail-closed)"
            );
        }
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

    let host = std::env::var("GITBX_WEB_HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let port: u16 = std::env::var("GITBX_WEB_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let ip: std::net::IpAddr = host
        .parse()
        .unwrap_or(std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST));
    let addr = SocketAddr::from((ip, port));
    tracing::info!("GITBX Web Server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
