# GITBX

> **Next-Gen Lightweight, Blazingly Fast, AI-Native Git GUI & Source Code Manager**  
> 对标 Sourcetree / GitKraken / Sublime Merge 的轻量化跨平台 Git 客户端与协同平台。

---

## ⚡ 核心设计亮点

- 🪶 **~20 MB 极小体积**：基于 **Rust + Tauri 2.0**，彻底告别臃肿的 Electron 与 Java 虚拟机，毫秒级极速冷启动。
- 🚀 **纯 Rust 极速内核**：结合 gitoxide (gix) 与 git2-rs，几十万级 Commit 历史树与 Diff 毫秒级呈现。
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
| **Git 核心引擎** | gitoxide (gix) + git2-rs |
| **差异比对引擎** | imara-diff / similar |
| **安全凭据管理** | keyring-rs (系统级安全密钥链) |
| **AI / Agent 协议** | Model Context Protocol (MCP) Rust SDK |
| **前端框架** | Vue 3 (Composition API + <script setup lang= ts>) + TypeScript |
| **UI 组件与样式** | shadcn-vue (Radix Vue) + Tailwind CSS v4 + Lucide Icons |
| **编辑器与 Diff** | CodeMirror 6 (定制 Diff & 3-Way Merge 扩展) |
| **状态与路由** | Pinia + Vue Router |
| **构建工具** | Vite + Cargo Workspace |
