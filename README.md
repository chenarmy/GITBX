# GITBX

> **Next-Gen Lightweight, Blazingly Fast, AI-Native Git GUI & Source Code Manager**  
> 对标 Sourcetree / GitKraken / Sublime Merge 的轻量化跨平台 Git 客户端与协同平台。

---

## ⚡ 核心设计亮点

- 🪶 **~20 MB 极小体积**：基于 **Rust + Tauri 2.0**，彻底告别臃肿的 Electron 与 Java 虚拟机，毫秒级极速冷启动。
- 🚀 **纯 Rust 极速内核**：第一阶段统一使用 git2-rs，避免多个 Git 引擎产生行为差异。
- 📊 **Canvas 虚拟拓扑轨道图**：Rust 端预计算拓扑布线与控制点，前端 Canvas 双缓冲 60 FPS 平滑滚动与交互。
- 📝 **精细化行级暂存与三方合并**：基于 **CodeMirror 6** 的高性能 Diff 编辑器，支持 Hunk/Line Staging 与 3-Way Merge 冲突可视化合并。
- 🤖 **AI 原生与 MCP 支持**：内置 AI 智能 Commit 消息生成、代码冲突化解建议、敏感凭据泄露探测；提供原生 **MCP (Model Context Protocol)** Server，AI Coding Agent（Cursor、Claude Code 等）可直接接管 Git 协同。
- 🌐 **桌面 + Docker/Web 双模式**：既是高性能原生桌面应用，也能通过内置 Axum 服务端一键部署为远程 Git Web 管理后台。

---

## 🛠️ 技术栈总览

| 模块 | 选型 |
| :--- | :--- |
| **桌面框架** | Tauri 2.0 (Rust 后端 + Webview 前端) |
| **自托管 Web 服务** | Axum (Rust Async Web 框架) |
| **Git 核心引擎** | git2-rs（统一由 `gitbx-core::GitService` 调用） |
| **差异比对引擎** | imara-diff / similar |
| **安全凭据管理** | keyring-rs (系统级安全密钥链) |
| **AI / Agent 协议** | MCP stdio JSON-RPC 兼容服务 |
| **前端框架** | Vue 3 (Composition API + <script setup lang= ts>) + TypeScript |
| **UI 组件与样式** | shadcn-vue (Radix Vue) + Tailwind CSS v4 + Lucide Icons |
| **编辑器与 Diff** | CodeMirror 6 (定制 Diff & 3-Way Merge 扩展) |
| **状态与路由** | Pinia + Vue Router |
| **构建工具** | Vite + Cargo Workspace |

---

## 当前实现

仓库已经完成 P0-P3 的基础闭环：Cargo workspace、共享 contracts、统一 `GitService`、Tauri/Axum 共用 Git 内核、结构化 Diff、分支/标签/Stash/远程/高级操作适配，以及前端 Tauri/Web API 分流。Web 服务默认支持仓库白名单和 Bearer Token；本地开发未配置时会明确输出警告。

AI 提交信息生成、敏感信息扫描和 MCP 工具已接入核心服务。高风险操作仍应在产品层增加确认弹窗和策略配置；跨平台发布包、完整 E2E、系统 Keyring 持久化和 MCP 工具权限 UI 属于后续发布阶段工作。

## 开发

```powershell
pnpm install
pnpm typecheck
pnpm build

cargo check --workspace
cargo test --workspace
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```

启动 Web 服务和前端开发服务器：

```powershell
$env:GITBX_ALLOWED_REPOS = 'C:\work\repo-a;C:\work\repo-b'
$env:GITBX_WEB_TOKEN = 'change-me'
cargo run -p gitbx-web

# 另开终端
pnpm dev
```

`GITBX_ALLOWED_REPOS` 使用分号分隔，并且会被 canonicalize；`GITBX_WEB_TOKEN` 配置后所有 Web API（健康检查除外）都要求 `Authorization: Bearer <token>`。Vite 仅负责将 `/api` 和 `/ws` 代理到 Axum，不再拼接或执行 Git shell 命令。

临时仓库 API 验证：

```powershell
node scripts/verify_all.cjs
```
