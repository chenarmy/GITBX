# GITBX 全栈代码质量审查确认与技术修复方案

> **文档版本**：v1.0.0  
> **审计基线**：GITBX v0.1.18（静态审查报告 `code-quality-review.html`）  
> **审查范围**：Rust 内核（`crates/`）、Tauri 桌面层（`src-tauri/`）、Web 服务端（`src-web/`）、Vue 前端（`src/`）与 CI/CD 工作流（`.github/`）  
> **核验结论**：审查报告中所列 **41 项问题（3 高危、18 中危、20 低危）全部 100% 存在于当前源码中**，未被修复。

---

## 目录
- [一、总体核查结论与风险矩阵](#一总体核查结论与风险矩阵)
- [二、P0 高危发现核查与详细修复方案（3 项）](#二p0-高危发现核查与详细修复方案3-项)
  - [H1 · Web 服务默认 fail-open 鉴权 + 任意命令执行（未授权 RCE）](#h1--web-服务默认-fail-open-鉴权--任意命令执行未授权-rce)
  - [H2 · pre_commit_command 任意命令执行能力缺乏来源约束与审计](#h2--pre_commit_command-任意命令执行能力缺乏来源约束与审计)
  - [H3 · abortRevert 误调用 abortMerge（功能性 Bug）](#h3--abortrevert-误调用-abortmerge功能性-bug)
- [三、中危发现核查与详细修复方案（18 项）](#三中危发现核查与详细修复方案18-项)
  - [3.1 后端 Rust 层面（M1 ~ M6）](#31-后端-rust-层面m1--m6)
  - [3.2 前端 Vue / TypeScript 层面（M7 ~ M14）](#32-前端-vue--typescript-层面m7--m14)
  - [3.3 工程化与 CI/CD 层面（M15 ~ M18）](#33-工程化与-cicd-层面m15--m18)
- [四、低危发现核查与批量处置指南（20 项）](#四低危发现核查与批量处置指南20-项)
- [五、分阶段落地路线图与验收计划](#五分阶段落地路线图与验收计划)

---

## 一、总体核查结论与风险矩阵

### 1.1 问题分布与确认统计

| 严重级别 | 报告数量 | 源码核实存在 | 优化/修复必要性 | 核心影响域 |
| :--- | :---: | :---: | :---: | :--- |
| **高危 (High)** | 3 | **3** (100%) | **必须立即修复 (P0)** | 局域网未授权 RCE、前端核心回滚流程崩溃 |
| **中危 (Medium)** | 18 | **18** (100%) | **近期必须修复 (P1/P2)** | 锁竞争、竞态覆盖、性能雪崩、凭据泄漏、架构维护性 |
| **低危 (Low)** | 20 | **20** (100%) | **迭代批量优化 (P3)** | 正则鲁棒性、协议规范、原子写入、类型完备度、配置冗余 |
| **合计** | **41** | **41** (100%) | - | - |

### 1.2 关键共识与治理方针（依 `/grill-me` 讨论决议）
1. **安全底线（H1/H2）**：Web 服务改为严格的 **Fail-closed** 鉴权策略，默认仅绑定 `127.0.0.1` 本地回环；Web API **全面彻底禁用** `pre_commit_command`；桌面 Tauri 保留该功能，但实施来源强约束与严格的安全审计日志。
2. **功能完备（H3）**：在后端与前端 API 层补齐 `abort_revert`，接入统一的 `operation_abort` 引擎，修复 Revert 中止操作。
3. **架构重构平滑演进（M7/M8）**：前端采用 **Facade（门面）兼容模式** 拆分 `useGitApi`（1435 行）和 `repoStore`（735 行），底层按功能域拆解，上层保留聚合导出，保证现有 30 余个 Vue 组件零破坏性变更。

---

## 二、P0 高危发现核查与详细修复方案（3 项）

### H1 · Web 服务默认 fail-open 鉴权 + 任意命令执行（未授权 RCE）

#### 1. 源码核实与定位
- **文件与行号**：
  - `src-web/src/main.rs:38`
    ```rust
    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    ```
  - `src-web/src/api/mod.rs:41-50`
    ```rust
    pub fn authorized(&self, headers: &HeaderMap) -> bool {
        match &self.auth_token {
            Some(expected) => headers
                .get("authorization")
                .and_then(|value| value.to_str().ok())
                .map(|value| value == format!("Bearer {expected}"))
                .unwrap_or(false),
            None => true, // ⚠️ 默认无 Token 时直接放行所有请求 (Fail-open)
        }
    }
    ```
  - `src-web/src/api/mod.rs:426`
    ```rust
    body_json.get("pre_commit_command").and_then(Value::as_str)
    ```
  - `crates/gitbx-core/src/service.rs:654-680`
    ```rust
    if let Some(command) = pre_commit_command ... {
        let output = if cfg!(windows) {
            hidden_command("cmd").args(["/C", command]).current_dir(path).output()
        } else {
            hidden_command("sh").args(["-c", command]).current_dir(path).output()
        }
    }
    ```
#### 2. 必要性评估
- **严重性**：**CVSS 9.8 (Critical)**。
- **影响**：GITBX Web 启动后默认监听所有网卡（`0.0.0.0:8080`），如果用户未配置 `GITBX_WEB_TOKEN` 环境变量，局域网内任何人向 `http://<IP>:8080/api/repo/commit` 发送一个包含 `pre_commit_command` 的 POST 请求，即可直接在服务端宿主机上以宿主权限执行任意系统命令（反弹 Shell、植入后门等）。

#### 3. 修复方案设计
1. **绑定地址收敛**：`src-web/src/main.rs` 默认监听地址改为 `127.0.0.1:8080`，仅当显式设置 `GITBX_WEB_HOST` 时才允许绑定外网网卡。
2. **鉴权策略转为 Fail-closed**：未配置 `GITBX_WEB_TOKEN` 时，除只读探活接口（`/api/health`）外，所有 `/api/repo/*`、`/api/ai/*` 均返回 `401 Unauthorized`；或者非本地回环时强制拒绝服务。
3. **Web 端彻底屏蔽 `pre_commit_command`**：在 `src-web/src/api/mod.rs` 的 commit 处理中，强制传 `None` 给 `create_commit_advanced`，忽略客户端传入的该参数。

#### 4. 代码级修复清单
```diff
--- a/src-web/src/main.rs
+++ b/src-web/src/main.rs
@@ -35,8 +35,11 @@ async fn main() -> anyhow::Result<()> {
         )
         .layer(TraceLayer::new_for_http());
 
-    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
-    tracing::info!("GITBX Web Server listening on http://{}", addr);
+    let host = std::env::var("GITBX_WEB_HOST").unwrap_or_else(|_| "127.0.0.1".into());
+    let port: u16 = std::env::var("GITBX_WEB_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
+    let ip: std::net::IpAddr = host.parse().unwrap_or(std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST));
+    let addr = SocketAddr::from((ip, port));
+    tracing::info!("GITBX Web Server listening on http://{}", addr);
```
```diff
--- a/src-web/src/api/mod.rs
+++ b/src-web/src/api/mod.rs
@@ -46,7 +46,7 @@ impl AppState {
                 .and_then(|value| value.to_str().ok())
                 .map(|value| value == format!("Bearer {expected}"))
                 .unwrap_or(false),
-            None => true,
+            None => false, // 严格 Fail-closed：未配置 Token 拒绝授权
         }
     }
@@ -423,7 +423,8 @@ async fn repo_handler(...) {
                 body_json
                     .get("sign")
                     .and_then(Value::as_bool)
                     .unwrap_or(false),
-                body_json.get("pre_commit_command").and_then(Value::as_str),
+                None, // 彻底禁用 Web 端传入的任意 pre_commit_command
             )
```

---

### H2 · pre_commit_command 任意命令执行能力缺乏来源约束与审计

#### 1. 源码核实与定位
- **文件与行号**：
  - `crates/gitbx-core/src/service.rs:642-680`
- **核实状态**：确认存在。任何能够调用 `create_commit_advanced` 的入口，传入任意字符串均会被交给底层操作系统 Shell（Windows `cmd /C`，Linux/macOS `sh -c`）同步执行，没有白名单过滤，也没有任何审计日志记录。

#### 2. 必要性评估
- **严重性**：**High**。
- **影响**：即使配置了鉴权或在桌面端，任意调用者只要控制请求体，就能以此作为提权或逃逸通道，且一旦执行失败或成功，系统无任何日志可追溯执行者、命令内容及执行时间。

#### 3. 修复方案设计
1. **执行审计日志**：使用 `tracing::warn!` 记录执行触发者、仓库路径、命令内容、退出码及耗时。
2. **入参防御性清洗**：禁止换行符及空命令。
3. **桌面端强约束**：在 Tauri 命令层 `src-tauri/src/commands/repo.rs` 仅允许经过桌面前端配置的本地用户操作，拒绝来自任何非信任 IPC 信道的非授权调用。

---

### H3 · abortRevert 误调用 abortMerge（功能性 Bug）

#### 1. 源码核实与定位
- **文件与行号**：
  - `src/stores/repo.ts:581-584`
    ```typescript
    const abortRevert = async () => {
      await gitApi.abortMerge(activeRepoPath.value); // ⚠️ 致命笔误：中止 Revert 调成了 abortMerge
      await loadRepo(activeRepoPath.value);
    };
    ```
  - `src/composables/useGitApi.ts`：全局搜索确认，仅有 `abortMerge`、`abortRebase`、`abortCherryPick`，根本没有声明和实现 `abortRevert`。
  - `crates/gitbx-core/src/service.rs:1301`：`abort_merge` 会强校验 `repo.inner().state() == git2::RepositoryState::Merge`；当用户处于 Revert 冲突状态时，调用 `abort_merge` 会必然报错 `"No merge operation is in progress"`，导致用户无法通过 UI 中止 Revert 操作！

#### 2. 必要性评估
- **严重性**：**High（核心功能阻断）**。
- **影响**：用户在 Revert 产生冲突时，点击界面工具栏的「中止 Revert」不仅无法恢复工作区，还会弹出错误提示，造成工作区状态锁死，严重破坏 Git 操作流程。

#### 3. 修复方案设计
1. 后端 `src-tauri/src/commands/repo.rs` 中已具备 `operation_abort`（其底层 `GitService::abort_operation` 已经支持 `RepositoryState::Revert` 与 `RevertSequence`），且 `src-web/src/api/mod.rs:682` 已有 `revert/abort` 路由。
2. 在 `src/composables/useGitApi.ts` 中封装 `abortRevert` 方法，分别桥接 Tauri 的 `operation_abort` 与 Web 端的 `/api/repo/revert/abort`。
3. 将 `src/stores/repo.ts:582` 的调用修正为 `await gitApi.abortRevert(activeRepoPath.value)`。

#### 4. 代码级修复清单
```typescript
// src/composables/useGitApi.ts
const abortRevert = async (repoPath: string): Promise<void> => {
  const cmd = `git revert --abort`;
  getConsole().logCommand(cmd);
  if (isTauri()) {
    await invoke('operation_abort', { repoPath });
    getConsole().logInfo('Revert aborted.');
    return;
  }
  const res = await fetch('/api/repo/revert/abort', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ repo_path: repoPath }),
  });
  await parseGitResponse(res, 'Failed to abort revert');
  getConsole().logInfo('Revert aborted.');
};
```
```typescript
// src/stores/repo.ts
const abortRevert = async () => {
  await gitApi.abortRevert(activeRepoPath.value); // 修复调用
  await loadRepo(activeRepoPath.value);
};
```

---

## 三、中危发现核查与详细修复方案（18 项）

### 3.1 后端 Rust 层面（M1 ~ M6）

#### M1 · Tauri 命令把结构化错误压平为 String
- **核实状态**：`src-tauri/src/commands/*.rs` 中使用 `pub type CommandResult<T> = Result<T, String>;`，将 `GitbxError::MergeConflict` 等通过 `.map_err(|e| e.to_string())` 转成了纯文本，前端只能靠 `message.includes('conflict')` 等正则匹配；而 Web 端有完善的 `GitErrorResponse { code, message, conflict }`。
- **必要性**：**Medium**。消除两端不一致，根治前端脆弱的文本解析。
- **方案**：
  1. 在 `crates/gitbx-contracts` 中为 `GitErrorResponse` 派生 `Serialize, Deserialize`。
  2. 在 `src-tauri` 中定义 `pub type CommandResult<T> = Result<T, GitErrorResponse>;`。
  3. Tauri command 发生错误时，调用 `impl From<GitbxError> for GitErrorResponse` 进行统一结构化转换。

#### M2 · 写操作锁纪律不一致
- **核实状态**：`crates/gitbx-core/src/service.rs` 中：
  - `create_commit_advanced`（第 642 行）未加锁；
  - `rename_stash`（第 987 行）先读后写，未加锁存在 TOCTOU 竞态；
  - `create_shelf`（第 1017 行）、`interactive_rebase`（第 544 行）均未经过 `with_write_lock`。
- **必要性**：**Medium**。避免多线程并发（例如后台拉取 + 前台提交或交互变基）损坏 Git 索引或 reflog。
- **方案**：将上述写方法全面收束至 `Self::with_write_lock(path, |repo| { ... })` 内部执行。

#### M3 · interactive_rebase 临时文件失败时泄漏
- **核实状态**：`crates/gitbx-core/src/service.rs:601-615` 中，`todo_path`、`editor_path`、`message_paths` 仅在 `output.status.success()` 为真时被删除。若 rebase 发生冲突、语法错误或 Git 进程异常终止，临时脚本与说明文件将永久滞留在 `.git/` 目录。
- **必要性**：**Medium**。防止 `.git` 目录长期积累垃圾文件与未清理的临时脚本。
- **方案**：引入 RAII Drop Guard 结构体，无论中间发生任何 `?` 报错或非零退出，在离开函数作用域时统一执行 `remove_file` 清理。

#### M4 · get_commits / get_file_history 性能问题
- **核实状态**：`crates/gitbx-core/src/repository/mod.rs:244` 在 `get_commits` 中对每一个 commit 都执行了一次 `get_commit_changes`（全量 tree-to-tree diff）。更严重的是，`get_file_history`（第 305 行）为了查询一个文件的历史，将 `scan_limit` 放大到 `max_count * 50`（最高达 10,000），从而触发了数千次完整 Diff！
- **必要性**：**Medium（性能致命）**。在大中型仓库中查看单文件历史会导致 UI 假死数秒乃至数十秒。
- **方案**：
  1. 重构 `get_file_history`：放弃全量 `get_commits` + in-memory filter 的做法；改用基于 libgit2 revwalk 的专用遍历，只对比单文件在父子 commit 中的 Tree Entry OID 是否变化，时间复杂度从 $O(N \times \text{TreeSize})$ 降至 $O(N)$。
  2. `get_commits`：图谱主列表展示默认不计算 `changed_paths`，或提供轻量化增量加载。

#### M5 · 桌面 / Web 层大量重复代码
- **核实状态**：`src-tauri/src/commands/diff.rs` 与 `src-web/src/api/mod.rs` 中，关于读工作区/暂存区文件、文本/二进制判断、图谱分页逻辑逐行重复，不仅增加了维护成本，而且 MCP 的 diff 工具已出现行为不一致（如对未跟踪文件的处理）。
- **必要性**：**Medium**。
- **方案**：将共用的文件读取、差异分析与分页逻辑下沉至 `crates/gitbx-diff` 和 `crates/gitbx-core`，Tauri、Web 与 MCP 三个外层仅保留纯参数映射与薄转发。

#### M6 · LlmConfig.api_key 可被序列化
- **核实状态**：`crates/gitbx-ai/src/provider/mod.rs:8`：
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize)]
  pub struct LlmConfig {
      pub api_key: Option<String>,
  }
  ```
  未标记 `#[serde(skip_serializing)]`，在结构体转 JSON（如保存配置或回传前端时）会明文暴露。
- **必要性**：**Medium**。防止敏感 Key 意外输出至日志或未脱敏序列化流中。
- **方案**：在 `api_key` 上添加 `#[serde(skip_serializing)]`，持久化仅走系统凭据管理器（Keyring）。

---

### 3.2 前端 Vue / TypeScript 层面（M7 ~ M14）

#### M7 · useGitApi 上帝对象（1435 行）
- **核实状态**：`src/composables/useGitApi.ts` 已膨胀至 1435 行，塞入了常规 Git 操作、AI 对话生成、本地历史快照、Worktree、终端命令、SSH 凭据管理、分支对比等全部逻辑。
- **必要性**：**Medium**。单文件过长，职责高度耦合，类型与测试难以维护。
- **方案（Facade 门面兼容设计）**：
  1. 新建 `src/api/domain/` 目录，划分为：
     - `gitRepoApi.ts`（仓库状态、分支、提交、标签、stash）
     - `gitDiffApi.ts`（差异对比、冲突、局部 patch）
     - `aiApi.ts`（AI 提交信息生成、智能冲突分析、密钥扫描）
     - `historyApi.ts`（单文件历史、Blame、本地历史快照）
     - `systemApi.ts`（系统终端、SSH、配置、目录选择）
  2. 原 `src/composables/useGitApi.ts` 作为统一 Facade 重新聚合导出所有子模块函数，**保持现有函数签名与引用路径 100% 兼容**，现有 30 多个组件无需修改 import。

#### M8 · repo store 职责过重且混入 UI 状态
- **核实状态**：`src/stores/repo.ts` 达 735 行，既包含仓库的核心业务数据（分支、状态、提交历史），又维护了 9 个弹窗显示状态（`isAddRepoModalOpen`、`isCloneModalOpen`、`isSettingsOpen`、`isMergeModalOpen` 等）及 `targetBranchForAction` 等瞬时 UI 变量。
- **必要性**：**Medium**。
- **方案**：
  1. 新建 `src/stores/ui.ts`，抽离所有弹窗开关状态与全局 UI 上下文。
  2. 在 `repo.ts` 中通过 getter/proxy 保留对 UI 状态的转发，逐步平滑过渡。

#### M9 · 状态更新入口不统一
- **核实状态**：多处组件直接修改 store 的 ref（例如 `repoStore.isAddRepoModalOpen = true`、`diffStore.isStaged = ...`），未通过 store action 进行收口，调试与状态回溯困难。
- **必要性**：**Medium**。
- **方案**：在各 Store 中补充语义化的动作函数（如 `openModal(type)`、`setStagedFilter(staged)`），并规范组件内调用。

#### M10 · loadRepo 存在竞态
- **核实状态**：`src/stores/repo.ts:151-228` 中，`loadRepo` 内部为异步多请求并发处理，无请求版本标记。当用户快速连续切换仓库（A -> B）时，若 A 的响应晚于 B 返回，会导致 A 的数据覆盖 B，造成显示错乱。
- **必要性**：**Medium**。
- **方案**：引入自增递增序列号 `loadSequence`。在异步结果返回后，校验 `if (seq !== currentSequence || path !== activeRepoPath.value) return;`，直接丢弃过期的脏响应。

#### M11 · diff 与冲突加载存在竞态
- **核实状态**：`src/stores/diff.ts` 中的 `selectFile` 与 `MergeConflictEditor.vue` 中的 `loadConflict` 同理，连续快速点击不同文件时，先发出的慢请求会覆盖后发出的快请求。
- **必要性**：**Medium**。
- **方案**：在发起请求前保存当前的 `selectedFile` 标识，异步拿到 Diff 结果时比对 `if (currentSelectedFile !== requestedFile) return;`。

#### M12 · 大量未 await / 未 catch 的 Promise
- **核实状态**：在 `CommitContextMenu.vue`、`BranchContextMenu.vue`、`NavbarHeader.vue` 中，类似 `repoStore.cherryPick(...)`、`repoStore.fetchRemote(...)` 等异步调用没有包在 `try-catch-finally` 中。一旦操作失败抛出异常，`emit('close')` 永远不会执行，导致右键上下文菜单卡死在屏幕上。
- **必要性**：**Medium**。
- **方案**：统一使用 `try { await ... } catch (e) { notifyError(e); } finally { emit('close'); }` 结构。

#### M13 · setRemoteUrl 日志泄漏远程 URL 凭据
- **核实状态**：`src/composables/useGitApi.ts:202-203` 中，`setRemoteUrl` 直接执行 `getConsole().logCommand(cmd)`，其中打印了未经脱敏的 `fetchUrl`；而同文件的 `cloneRepo` 正确使用了 `redactRemoteUrl`。如果 Remote URL 中带有 `https://user:token@host`，明文 Token 将直接泄露在控制台面板中。
- **必要性**：**Medium（高价值凭据风险）**。
- **方案**：在 `setRemoteUrl` 的日志打印处套用 `redactRemoteUrl(fetchUrl)`。

#### M14 · 可访问性缺口
- **核实状态**：`ConfirmationDialog.vue` 及各业务弹窗缺少 `role="dialog"`、`aria-modal="true"`，关闭按钮缺少 `aria-label`，键盘 Esc/Tab 焦点未作循环陷阱（Focus Trap），屏幕阅读器无法识别。
- **必要性**：**Medium**。
- **方案**：提取通用的 `useDialogA11y` composable，补齐 ARIA 属性与焦点管理。

---

### 3.3 工程化与 CI/CD 层面（M15 ~ M18）

#### M15 · README 虚假技术栈声明
- **核实状态**：
  - `README.md` 声明使用 Tailwind CSS v4，但 `package.json` 实际为 `^3.4.3` 且配置为 Tailwind v3 标准写法；
  - 声明使用 shadcn-vue 与 Radix Vue，但项目中没有任何相关依赖与组件引入；
  - 声明使用 Vue Router，而实际完全使用 Pinia + 组件条件渲染进行页面切换。
- **必要性**：**Medium**。修正文档失真，避免给开源社区和新维护者带来误导。
- **方案**：全面修正 `README.md`，如实反映 Tailwind CSS v3 与组件架构。

#### M16 · CI 无前端 lint 与测试
- **核实状态**：`.github/workflows/ci.yml` 的 `frontend` job 仅包含 `pnpm typecheck` 和 `pnpm build`，无 ESLint 静态代码检查，无前端单元测试流程。
- **必要性**：**Medium**。
- **方案**：在 `package.json` 中配置 ESLint 与 Vitest，并在 `ci.yml` 中补充 `pnpm lint` 与 `pnpm test` 步骤。

#### M17 · workflow_dispatch 输入命令注入 + Action 未锁 SHA
- **核实状态**：`.github/workflows/mirror-cnb-manual.yml` 中直接使用 `${{ inputs.tag }}` 拼入 Bash 变量环境，且所有 GitHub Actions 均使用浮动版本标签（如 `@v4`、`@v1`），存在供应链被篡改攻击的潜在风险。
- **必要性**：**Medium**。
- **方案**：在工作流中增加输入格式正则校验（如 `^v[0-9]+\.[0-9]+\.[0-9]+$`），关键 Action 锁定至不可变的 Commit SHA。

#### M18 · Rust CI 仅在 Windows 运行
- **核实状态**：`.github/workflows/ci.yml` 中 `rust` 任务仅在 `windows-latest` 运行。由于 Rust 涉及 Linux/macOS 平台特性（如 Unix Shell 处理、系统 Keyring 等），跨平台编译错误会一直延迟到打 Tag 发布时才暴露。
- **必要性**：**Medium**。
- **方案**：在 CI 中引入 Matrix 构建，或者至少增加一个 `ubuntu-latest` 的 `cargo check --workspace` 校验任务。

---

## 四、低危发现核查与批量处置指南（20 项）

| ID | 区域 | 问题核实结论 | 优化必要性 | 推荐修复方案 |
| :---: | :---: | :--- | :---: | :--- |
| **L1** | 后端 | `crates/gitbx-ai/src/secret_scanner.rs`: 构造时 `Regex::new.unwrap()`；匹配后返回了完整明文密钥片段 | 是 | 改用 `lazy_static!` 或 `OnceLock` 预编译正则；`matched_snippet` 实施星号脱敏（如仅显示首尾字符） |
| **L2** | 后端 | `crates/gitbx-mcp/src/tools/mod.rs`: `get_diff` 对未跟踪文件调 `repo.index_file` 报错，与桌面端展现不一致 | 是 | 捕获未跟踪错误，回退为空内容对比，展示为新增文件 |
| **L3** | 后端 | `src-web/src/api/mod.rs:46`: `value == format!("Bearer {expected}")` 存在非常数时间时序侧信道 | 是 | 引入 `subtle::ConstantTimeEq` 进行恒定时间比较 |
| **L4** | 后端 | `crates/gitbx-core/src/service.rs:53`: 全局 `REPO_LOCKS` HashMap 只增不删，长期运行有内存泄漏隐患 | 是 | 引入带容量上限的 LRU 缓存或周期性驱逐无引用的锁项 |
| **L5** | 后端 | `src-tauri/src/commands/config.rs:46-57`: 配置文件直接 `truncate + write`，进程崩溃可致配置损坏 | 是 | 采用原子写入机制（先写临时文件 `.tmp`，再执行 `fs::rename` 覆盖） |
| **L6** | 后端 | `crates/gitbx-mcp/src/server.rs:9`: 未校验 `jsonrpc: "2.0"`；非法行静默丢弃不符合规范 | 是 | 严格解析 JSON-RPC 规范，解析失败返回标准 `-32700 Parse error` 错误报文 |
| **L7** | 后端 | `src-web/src/api/mod.rs:791`: `_ if endpoint == "not-found"` 为不可达死代码；`write_op` 的 `_path` 未使用 | 是 | 统一清理死路由判断与未使用的参数命名 |
| **L8** | 后端 | `crates/gitbx-core/src/remote/mod.rs:243`: CLI 回退失败若 stderr 为空，丢失报错细节 | 是 | 同时捕获 stdout 与 stderr，提供详尽的诊断信息 |
| **L9** | 后端 | `crates/gitbx-core/src/status/mod.rs:212`: `create_commit`（MCP 路径）未校验提交信息为空 | 是 | 增加 `if message.trim().is_empty()` 防御性校验 |
| **L10** | 前端 | `src/composables/useGitApi.ts`: `getFileDiff` 返回 `Promise<any>`，36+ 处 `catch (e: any)` | 是 | 补充 `DiffResult` 强类型定义，将错误类型收束为 `unknown` 并做类型保护 |
| **L11** | 前端 | `StagingPanel.vue`（504 行）与 `MainToolbar.vue`（457 行）过大；文件树构造存在重复代码 | 是 | 提取通用的 `useFileTree` composable，拆分子组件 |
| **L12** | 前端 | `ConsolePanel.vue:52`、`AiAssistantModal.vue:164`: `clipboard.writeText` 缺少 `.catch()` | 是 | 追加 `.catch((err) => notification.warn('剪贴板复制失败'))` |
| **L13** | 前端 | `GraphFilterBar.vue`: props 无运行时校验；自定义事件名 kebab-case 不统一 | 是 | 规范定义 props 校验与统一 emit 命名规范 |
| **L14** | 前端 | `src/stores/repo.ts:273`: `stageAll` 与 `unstageAll` 未被任何 UI 触发，成为死代码 | 是 | 确认业务逻辑后移除无用导出或补齐对应快捷键入口 |
| **L15** | 前端 | `ResetModal.vue`、`MergeModal.vue`: 存在部分硬编码英文字符串 | 是 | 提取至 `src/i18n/locales/` 语言包中 |
| **L16** | 桌面 | `src-tauri/tauri.conf.json:36`: 自动更新回退地址硬编码了过期的 `v0.1.1` | 是 | 修正为通用的 `releases/latest/download/latest.json` |
| **L17** | 工程 | `README.md` 记载为 GitCode 镜像，而当前 CI 实际已迁移至 CNB | 是 | 同步更正 README 与发布脚本中的镜像源描述 |
| **L18** | 桌面 | `tauri.conf.json`: `"csp": null`；`capabilities/default.json` 对 dialog 授权偏宽 | 是 | 配置严格的 CSP 策略，收紧必要的文件系统与对话框权限 |
| **L19** | 工程 | `tailwind.config.js` content 包含无用的 `./pages`、`./app`；`.gitignore` 规则微调 | 是 | 清理无用扫描路径，加快 Tailwind 编译构建效率 |
| **L20** | 工程 | 根目录缺少 `.editorconfig`，未配置 ESLint / Prettier 工具链统一风格 | 是 | 补齐 `.editorconfig` 与前端标准化工程配置 |

---

## 五、分阶段落地路线图与验收计划

### 5.1 批次划分

```mermaid
graph LR
    P0["P0: 立即修复 (安全与核心 Bug)"] --> P1["P1: 本周修复 (信息泄露与工程规范)"]
    P1 --> P2["P2: 近期修复 (并发健壮性与性能)"]
    P2 --> P3["P3: 迭代重构 (架构解耦与代码清理)"]

    style P0 fill:#fee2e2,stroke:#dc2626,stroke-width:2px;
    style P1 fill:#fef3c7,stroke:#d97706,stroke-width:2px;
    style P2 fill:#dbeafe,stroke:#2563eb,stroke-width:2px;
    style P3 fill:#f3f4f6,stroke:#4b5563,stroke-width:2px;
```

- **P0 阶段（立即实施）**：
  - H1：Web fail-closed 鉴权改造 + 默认监听 `127.0.0.1` + 禁用 Web 端 `pre_commit_command`。
  - H2：`create_commit_advanced` 来源限制与操作审计日志。
  - H3：后端与前端补齐 `abort_revert` 命令，修正 `repoStore.abortRevert` 误调用。
- **P1 阶段（安全与凭据加固）**：
  - M13：`setRemoteUrl` 凭据日志脱敏。
  - M6：`LlmConfig.api_key` 增加 `#[serde(skip_serializing)]`。
  - M17：工作流参数格式强校验 + GitHub Actions 锁定。
  - M15：更正 `README.md` 技术栈与发布镜像说明。
- **P2 阶段（健壮性与性能治理）**：
  - M10/M11：修复 `loadRepo` 与 `diff` 加载竞态。
  - M12：修复前端菜单与操作中的未捕获 Promise。
  - M2：补齐 `crates/gitbx-core` 所有写操作的 `with_write_lock`。
  - M3：`interactive_rebase` 引入 RAII 临时文件自动清理。
  - M4：优化 `get_file_history`，以单文件 Entry 遍历取代全量 Diff。
- **P3 阶段（架构解耦与工程化批量收尾）**：
  - M1/M5：Tauri 错误结构化改造，下沉共享 Diff 逻辑。
  - M7/M8/M9：前端 Facade 模式拆分 `useGitApi` 与 `useUiStore`。
  - M14：补齐全套 Dialog ARIA 与键盘导航。
  - M16/M18：完善 CI 平台跨平台矩阵构建与前端 Lint/Test 门禁。
  - L1 ~ L20：批量处置低危项与配置清理。

### 5.2 验证与验收方案
1. **安全回归验证**：
   - 启动 `gitbx-web`，验证在未设置 `GITBX_WEB_TOKEN` 情况下，远程及本地尝试调用 `/api/repo/commit` 均返回 401。
   - 验证 Web 端 POST 报文携带 `pre_commit_command` 时，系统不会触发任何子进程执行。
2. **功能回归验证**：
   - 在测试仓库制造 Revert 冲突，点击界面「中止 Revert」按钮，验证 `git status` 恢复干净，无任何报错弹窗。
3. **性能回归验证**：
   - 在大型 Git 仓库（如 5000+ 提交）中针对单文件调用 `get_file_history`，耗时应从秒级/卡死降低至 100ms 以内。
4. **编译与质量门禁**：
   - `cargo fmt --all -- --check`
   - `cargo clippy --workspace --all-targets -- -D warnings`
   - `cargo test --workspace`
   - `pnpm typecheck`
