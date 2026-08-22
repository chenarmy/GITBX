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

### 多语言

前端语言由 `src/i18n/config.ts` 配置，当前内置 English、日本語、Deutsch、Español、简体中文、繁體中文、Français 和 العربية。打开 GITBX 设置即可切换，选择会保存到本地并在下次启动时恢复；阿拉伯语会自动启用从右到左布局。新增语言时，在 `Locale`、`SUPPORTED_LOCALES` 和 `messages` 中增加对应配置即可。

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

## 桌面版本发布与更新

桌面端使用 Tauri 签名更新，正式更新元数据从
`https://github.com/chenarmy/GITBX/releases/latest/download/latest.json` 获取。普通开发构建保留占位公钥并禁用自动检查；发布工作流会在构建前注入正式公钥。

首次发布前，在 GitHub 仓库中配置：

- Actions Variable `TAURI_UPDATER_PUBLIC_KEY`
- Actions Secret `TAURI_SIGNING_PRIVATE_KEY`
- Actions Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

发布新版本时先同步版本并补充对应的 `CHANGELOG.md` 章节：

```powershell
pnpm version:set 0.1.1
pnpm install
cargo check --workspace
pnpm version:check
git tag v0.1.1
git push origin v0.1.1
```

推送 `vX.Y.Z` Tag 后，Release 工作流会构建 Windows、macOS 和 Linux 安装包，上传签名文件及 `latest.json`，并使用对应版本的 Changelog 作为 GitHub Release 正文。
