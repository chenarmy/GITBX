use gitbx_mcp::McpServer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    McpServer::run_stdio().await
}
