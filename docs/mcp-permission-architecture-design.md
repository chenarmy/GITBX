# GITBX MCP 集中权限管控与接入架构设计方案

> **设计基准**：对齐 DBX 中心化零信任网关、分层继承策略与热生效架构  
> **目标工程**：`chenarmy/GITBX` (`crates/gitbx-mcp`, `crates/gitbx-contracts`, `src-tauri`, `src/components/settings`)

---

## 1. 架构目标与核心理念

当前 `crates/gitbx-mcp` 仅通过环境变量 `GITBX_MCP_MODE`（readonly / write / unsafe）做粗粒度模式匹配，外部客户端每次请求需显式传递 `repo_path`，且缺乏图形化配置、资产白名单隔离、分支保护与热更新能力。

借鉴 DBX 的设计精髓：
1. **客户端参数零污染**：外部 AI 客户端（Claude Code, Cursor 等 13 款工具）配置**只包含启动命令与通信协议参数**，严禁注入权限、密钥或仓库范围变量。
2. **所有权集中在桌面端**：连接范围（仓库/分组白名单）、操作权限（只读/安全读写/完全访问）、分支保护（受保护分支锁）均由 GITBX 统一管控。
3. **策略热更新即时生效**：在 GITBX 界面调整权限或剔除仓库，无需重启任何 MCP 客户端，下一个请求毫秒级生效并实时拦截。

```
┌────────────────────────────────────────────────────────────────────────┐
│  外部 AI 客户端 (Cursor / Claude Code / VS Code / Windsurf / TRAE...)  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ JSON-RPC (stdio 或 local HTTP)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    GITBX MCP Server (gitbx-mcp)                        │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │               安全拦截管道 (Policy Interceptor)                │   │
│   │                                                                │   │
│   │  [1. 工具级暴露检查] ──▶ 是否在 enabled_tools 白名单中?       │   │
│   │           │                                                    │   │
│   │  [2. 仓库可见性检查] ──▶ repo_path 是否在允许的仓库白名单中?   │   │
│   │           │                                                    │   │
│   │  [3. 权限等级与分支保护] ─▶ 是否修改了 main/master 保护分支?   │   │
│   │           │                 是否触发了未授权的高危操作?        │   │
│   └───────────┼────────────────────────────────────────────────────┘   │
│               │ 校验通过                                               │
│               ▼                                                        │
│       统一 GitService (git2-rs / imara-diff 核心引擎)                  │
└───────────────▲────────────────────────────────────────────────────────┘
                │ 本地策略同步 (notify 文件监听 / 本地原子持久化)
┌───────────────┴────────────────────────────────────────────────────────┐
│               GITBX 桌面端 (Tauri 2.0 + Vue 3 GUI)                     │
│  - MCP 授权向导 (默认权限 ➔ 仓库分组 ➔ 分支保护 ➔ 工具汇总)            │
│  - 状态持久化与热更新 (`~/.gitbx/mcp-policy.json`)                     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 权限模型与语义安全矩阵

在 DBX 中是「只读 / 数据读写 / 完全访问」，在 GITBX 中映射为如下 3 级操作权限：

### 2.1 三级权限能力矩阵

| 能力分类 | 只读 (ReadOnly) | 安全读写 (SafeWrite, 推荐) | 完全访问 (FullAccess) | 说明与拦截行为 |
| :--- | :---: | :---: | :---: | :--- |
| **状态查询与历史浏览** | ✅ | ✅ | ✅ | `gitbx_status`, `gitbx_log`, `gitbx_branches`, `gitbx_tags` |
| **差异比对与溯源** | ✅ | ✅ | ✅ | `gitbx_diff`, `gitbx_blame`, `gitbx_show` |
| **工作区储藏** | ❌ | ✅ | ✅ | `gitbx_stash`, `gitbx_stash_pop` |
| **局部暂存与撤销** | ❌ | ✅ | ✅ | `gitbx_stage_file`, `gitbx_stage_all`, `gitbx_unstage` |
| **规范提交 (Commit)** | ❌ | ✅ (限非保护分支) | ✅ | 受保护分支（`main` 等）强制拦截，防止 AI 污染主干 |
| **创建特性分支** | ❌ | ✅ | ✅ | `gitbx_create_branch` (限派生 `feature/*`, `fix/*`) |
| **分支变基与合并** | ❌ | ❌ | ✅ | `gitbx_merge`, `gitbx_rebase`, `gitbx_cherry_pick` |
| **破坏性重置与清理** | ❌ | ❌ | ✅ | `gitbx_reset --hard`, `gitbx_clean -fd` |
| **远程同步 (Fetch/Pull)** | ❌ | ✅ (仅限 Fetch) | ✅ | 拉取最新远端元数据 |
| **远程推送 (Push)** | ❌ | ❌ | ✅ (禁 Force Push) | 强推 `--force` 即使在完全模式下也需二次单独勾选授权 |

### 2.2 权限继承与优先级算法

```
分支保护强制锁 (Protected Branch Lock)
   ▼ (若命中保护分支，强制降级为只读)
单仓库精细配置 (Repo Override Rule)
   ▼ (若未配置，继承上级分组)
仓库分组规则 (Group Rule)
   ▼ (若未配置，继承全局)
全局默认权限 (Global Mode: ReadOnly | SafeWrite | FullAccess)
```

$$\text{分支保护锁} \gg \text{单仓设置} > \text{分组默认} > \text{全局默认}$$

---

## 3. UI 向导流程设计 (4 步流对齐 DBX)

在 GITBX 设置中心增加 **MCP 授权设置 (MCP Settings)**：

### Step 1: 全局默认权限
- **选项卡片**：`只读` | `安全读写 (推荐)` | `完全访问`
- **能力对比表**：展示只读、安全读写、完全访问的具体指令与边界。
- **说明提示**：设置未单独配置仓库时使用的默认级别。后续可为单仓设置覆盖，但不可突破仓库白名单。

### Step 2: 仓库与分组范围
- **可见范围**：`所有受管仓库` vs `自定义白名单`
- **树状资产列表**：
  - 勾选分组节点，动态包含当前及未来新增的下级仓库。
  - 未勾选的仓库对 MCP 完全隐身，AI 无法罗列；显式传入路径直接被 403 阻断。

### Step 3: 分支保护与远程范围
- **受保护分支通配符**：`main, master, release/*`（命中时写操作阻断并提示 AI 创建特性分支）。
- **远程策略选择**：
  - `禁止远程操作 (默认)`
  - `仅允许 Fetch/Pull`
  - `允许 Push (禁止 Force Push)`
  - `完全开放`

### Step 4: 汇总与工具权限
- **最终生效矩阵预览**：展示各仓库的最终生效模式、受保护分支与权限来源。
- **MCP 工具暴露清单 (Tool Whitelist)**：
  - ☑ 列出受管仓库 (`gitbx_list_repos`)
  - ☑ 状态与历史 (`gitbx_status`, `gitbx_log`, `gitbx_branches`)
  - ☑ 代码比对 (`gitbx_diff`)
  - ☑ 暂存与提交 (`gitbx_stage_file`, `gitbx_stage_all`, `gitbx_commit`)
  - ☐ 分支合并与变基 (`gitbx_merge`, `gitbx_rebase`, `gitbx_cherry_pick`)
  - ☐ 远程交互 (`gitbx_fetch`, `gitbx_pull`, `gitbx_push`)
- **防缓存机制**：取消选择的工具，从 `tools/list` 中剔除；若客户端缓存了 Schema 强行调用，服务端立即拒绝。

---

## 4. 13 款主流客户端接入规范模板

所有客户端配置保持**纯净**，无权限或仓库参数：

### 4.1 标准 stdio 模式配置 (通用 JSON)
适用于：Cursor, VS Code (Cline/Roo Code/Continue), Windsurf, TRAE, ZCode, CodeBuddy Code, Cherry Studio, Qoder, WorkBuddy

```json
{
  "mcpServers": {
    "gitbx": {
      "command": "gitbx-mcp",
      "args": []
    }
  }
}
```
*注：在 Windows 环境若未配置系统 PATH，可使用绝对可执行文件路径，如 `C:\\Program Files\\GITBX\\resources\\gitbx-mcp.exe`。*

### 4.2 Claude Code (CLI) 快速接入
```bash
claude mcp add gitbx gitbx-mcp
```

### 4.3 本地 Streamable HTTP 模式 (若在 GITBX 开启 HTTP 服务)
适用于：OpenCode, DeepSeek Harness, Codex 以及支持 SSE 的应用：
```json
{
  "mcpServers": {
    "gitbx": {
      "url": "http://127.0.0.1:5226/mcp"
    }
  }
}
```

---

## 5. 代码改造与工程落地计划

### 5.1 契约层与数据结构定义 (`crates/gitbx-contracts`)
#### [MODIFY] `crates/gitbx-contracts/src/lib.rs`
新增策略模型定义：
```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum McpPermissionLevel {
    ReadOnly,
    SafeWrite,
    FullAccess,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpRepoRule {
    pub repo_path: String,
    pub override_level: Option<McpPermissionLevel>,
    pub protected_branches: Vec<String>,
    pub allow_remote_fetch: bool,
    pub allow_remote_push: bool,
    pub allow_force_push: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpPolicyConfig {
    pub version: u32,
    pub global_level: McpPermissionLevel,
    pub allow_all_repos: bool,
    pub allowed_repos: Vec<McpRepoRule>,
    pub enabled_tools: Vec<String>,
    pub allow_active_repo_fallback: bool,
}
```

### 5.2 服务端策略拦截器引擎 (`crates/gitbx-mcp`)
#### [MODIFY] `crates/gitbx-mcp/src/server.rs`
- 移除原先硬编码的环境变量 `GITBX_MCP_MODE`。
- 引入 `PolicyEngine`：
  - 加载 `~/.gitbx/mcp-policy.json`。
  - 使用文件变更监听或 mtime 缓存实现热更新。
- 在 `handle_request` 处理 `tools/call` 前插入 `authorize_tool_call`：
  1. **检查 Tool 是否在 `enabled_tools` 白名单**。
  2. **检查 `repo_path` 是否在 `allowed_repos` 范围内**。
  3. **计算最终生效权限级别**（单仓覆盖 > 全局默认）。
  4. **受保护分支拦截**：若调用写操作工具，先读取仓库当前 HEAD 分支，若匹配 `protected_branches` 则直接拦截报错：
     ```json
     {
       "code": -32001,
       "message": "Permission Denied: Current branch 'main' is protected in GITBX. Please create a feature branch first."
     }
     ```
#### [MODIFY] `crates/gitbx-mcp/src/tools/mod.rs`
- 新增 `gitbx_list_repos` 工具，仅返回授权可见的仓库列表。
- 为各个 Git 操作添加细粒度分支保护与只读检查。

### 5.3 Tauri 桌面后端配置持久化 (`src-tauri`)
#### [NEW] `src-tauri/src/commands/mcp.rs`
提供前端 IPC 调用：
- `load_mcp_policy()`: 读取 `~/.gitbx/mcp-policy.json`。
- `save_mcp_policy(policy: McpPolicyConfig)`: 原子保存并触发热生效。
- `get_mcp_managed_repos()`: 获取当前 GITBX 仓库列表用于在授权界面中勾选。
- `get_mcp_server_status()`: 获取 stdio 路径与 HTTP 监听服务状态。

### 5.4 前端 Vue 3 设置界面实现 (`src/components/settings`)
#### [NEW] `src/components/settings/McpPermissionsModal.vue`
实现 4 步向导界面：
- Step 1: `McpStepDefaultLevel.vue`（三级基线卡片与能力对照表）
- Step 2: `McpStepRepoScope.vue`（树状资产列表、分组与单仓勾选）
- Step 3: `McpStepBranchProtection.vue`（受保护分支规则输入标签、远程交互单选）
- Step 4: `McpStepSummaryTools.vue`（权限矩阵明细表、MCP 工具集多选）
