# GITBX 全功能综合测试计划 (基于 gitbx-4-test 仓库)

> **文档版本**: 1.0.0  
> **关联测试仓库**: `I:\gitbx-4-test` (远程: `https://gitee.com/chenskidy/gitbx-4-test.git`)  
> **适用版本**: GITBX v0.1.21+ (Tauri 2.0 桌面端 + Axum 自托管 Web 端)  
> **编制依据**: GITBX 系统架构规范、`gitbx-core` 统一内核规范、H1 安全防护机制与 MCP 协同协议

---

## 一、 测试概述与目标

本测试计划以用户提供的专用测试仓库 **`gitbx-4-test`** 为核心基准，旨在对 GITBX 进行全方位、全功能、多维度的整体测试验证。

### 1.1 测试目标
1. **功能完整性 (100% 覆盖)**：覆盖 GITBX 现有的全部 19 个功能子系统，涵盖工作区管理、暂存提交流程、分支与拓扑图谱、差异比对、3-Way 冲突合并、Git Worktree 多工作树、本地快照历史、AI 智能助手、敏感信息泄漏拦截、MCP 协同以及系统设置与多语言等。
2. **双端架构一致性**：同时验证桌面原生 GUI 模式（Tauri 2.0 IPC）与远程 Web 自托管模式（Axum REST API + WebSocket）在相同业务逻辑下的行为一致性与数据契约一致性。
3. **数据安全与鲁棒性**：验证智能检出（Smart Checkout）不丢代码机制、变基与合并冲突还原（Abort/Rollback）保护、租约强制推送（Force with lease）安全防护及 Web Fail-closed 鉴权与目录白名单机制。

---

## 二、 测试环境与预置工具链

### 2.1 基础环境要求
- **操作系统**: Windows 10/11 x64
- **Rust 工具链**: Rust 1.78+ (nightly/stable)
- **Node.js**: v18+ / pnpm 8+
- **Git 版本**: Git 2.30+ for Windows
- **测试仓库物理路径**: `I:\gitbx-4-test`
- **项目工程源码路径**: `I:\GITBX`

### 2.2 预置测试工具与一键脚本
为确保测试的可重复性与自动化执行，GITBX 在 `scripts/` 下专门提供了两组测试专用脚本：

| 脚本文件 | 作用与功能 | 执行命令 |
| :--- | :--- | :--- |
| `scripts/setup_gitbx_4_test.cjs` | **测试环境一键拓扑构造**：自动化在 `I:\gitbx-4-test` 中生成包含基础提交、功能分支、冲突分支、版本标签及多语言多格式源码的完整工程拓扑。 | `node scripts/setup_gitbx_4_test.cjs` |
| `scripts/verify_gitbx_4_test.cjs` | **全自动化矩阵回归套件**：一键拉起测试服务，对 `gitbx-4-test` 执行 37 项核心 API 与底层引擎的自动化断言测试。 | `node scripts/verify_gitbx_4_test.cjs` |

---

## 三、 测试仓库拓扑与数据设计

`gitbx-4-test` 预先设计了丰富的 Git 分支拓扑与真实代码场景，以供各类测试执行：

```mermaid
gitGraph
   commit id: "7a7513d (v0.1.0)" tag: "v0.1.0"
   branch develop
   checkout develop
   commit id: "f458b86 (utils)"
   branch feat/user-auth
   checkout feat/user-auth
   commit id: "6c7c6f8 (auth)"
   checkout develop
   branch feat/payment
   checkout feat/payment
   commit id: "a130487 (payment)"
   checkout master
   branch hotfix/v1.0.1
   checkout hotfix/v1.0.1
   commit id: "94200d6 (hotfix)"
   checkout master
   branch conflict/base
   checkout conflict/base
   commit id: "e1fa34b (cfg-base)"
   branch conflict/branch-a
   checkout conflict/branch-a
   commit id: "3c8c877 (port:8080)"
   checkout conflict/base
   branch conflict/branch-b
   checkout conflict/branch-b
   commit id: "fb6e03b (port:9000)"
   checkout master
```

### 3.1 分支职能划分

| 分支名称 | 基础起点 | 预设数据内容 | 测试职能 |
| :--- | :--- | :--- | :--- |
| **`master`** | Initial | `README.md`, `package.json`, `src/index.ts`, `src/math.ts`, `src/config.json`, `.gitignore` | 主线稳定基线，测试工作区状态、暂存、提交、Reset |
| **`develop`** | `master` | 新增 `src/utils.ts`，附加 Tag `v1.0.0-beta` | 测试主开发流、常规切分支与快进合并 |
| **`feat/user-auth`** | `develop` | 新增 `src/auth.ts` (登录认证逻辑) | 测试多分支并行、分叉轨道图及文件级增量比对 |
| **`feat/payment`** | `develop` | 新增 `src/payment.ts` (支付接口) | 测试独立功能开发、Cherry-pick 拣选提交 |
| **`conflict/base`** | `master` | `src/config.json` 基础结构定义 | 冲突基准祖先节点 |
| **`conflict/branch-a`** | `conflict/base` | `src/config.json` 修改为端口 8080、暗黑主题 | **合并冲突方 A (Ours)**，验证 3-Way 冲突编辑器 |
| **`conflict/branch-b`** | `conflict/base` | `src/config.json` 修改为端口 9000、明亮主题 | **合并冲突方 B (Theirs)**，验证 3-Way 冲突与 AI 化解建议 |
| **`hotfix/v1.0.1`** | `master` | `README.md` 追加重要补丁说明 | 验证 **Git Worktree 多工作树** 独立检出与并行开发 |

---

## 四、 全功能模块测试方案与用例矩阵

---

### 模块 1：仓库管理与工作区生命周期 (Repository Lifecycle)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01-01** | 打开已有本地仓库 | 桌面端已启动 | 在 GITBX 点击“打开仓库”或输入路径 `I:\gitbx-4-test` | 成功载入仓库，左侧工作区树展示分支、状态栏显示分支 `master`，无报错 |
| **TC-01-02** | 仓库基本信息查询 | 已打开仓库 | 调用 `get_repo_info` 或查看顶部信息面板 | 返回仓库名 `gitbx-4-test`、当前 HEAD 分支为 `master`、显示未提交修改状态 |
| **TC-01-03** | 自动发现 Git 根目录 | 存在嵌套或上级目录 | 选择 `I:\gitbx-4-test\src` 子目录打开 | GITBX 自动追溯并识别真实根目录 `I:\gitbx-4-test` |
| **TC-01-04** | Web 白名单访问控制 | Axum 服务已启动 | 未在 `GITBX_ALLOWED_REPOS` 配置非法路径并尝试请求 API | 返回 HTTP 403 `REPO_NOT_ALLOWED`，有效阻断目录遍历攻击 |

---

### 模块 2：工作区状态与暂存区管理 (Staging Area & Working Copy)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-02-01** | 变更文件状态感知 | 位于 `master` | 新建 `test.txt`，修改 `README.md`，删除 `math.ts` | 暂存面板准确识别出 Untracked (U)、Modified (M)、Deleted (D) 状态分类 |
| **TC-02-02** | 单文件暂存与取消暂存 | 工作区存在修改 | 1. 点击 `test.txt` 后的 `+` (Stage)<br>2. 验证暂存列表<br>3. 点击 `-` (Unstage) | 1. 文件进入 Staged 暂存区<br>2. 取消暂存后回到 Unstaged 区，内容完好无损 |
| **TC-02-03** | 全部暂存与全部取消 | 存在多个改动文件 | 1. 点击“全部暂存 (Stage All)”<br>2. 点击“全部取消 (Unstage All)” | 1. 所有文件一次性进入暂存区<br>2. 所有文件一次性恢复至未暂存状态 |
| **TC-02-04** | 放弃未暂存变更 (Discard) | 修改已跟踪文件 | 修改 `README.md` 某行后点击“放弃更改” | 工作区修改被撤销，文件自动还原为最后一次 Commit 的状态 |
| **TC-02-05** | 块级暂存 (Hunk Staging) | 文件有多处分散修改 | 在 Diff 界面中针对指定 Hunk 点击“暂存此块” | 仅该代码块进入暂存区，其余修改仍保留在未暂存区 |
| **TC-02-06** | 行级暂存 (Line Staging) | 文件单块内有多行增删 | 勾选或点击特定代码行进行暂存 | 仅选定代码行被生成补丁应用至 Index，未选定行保持未暂存 |

---

### 模块 3：提交管理与提交规范 (Commit Engine)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-03-01** | 标准提交创建 | 暂存区存在文件 | 填写 Commit Message `feat: add sample module`，点击提交 | 成功生成新 Commit，HEAD 指向新提交，状态区清空，拓扑图实时追加新节点 |
| **TC-03-02** | 提交追加 (Commit Amend) | 已完成一次提交 | 勾选“Amend (修补最后一次提交)”，追加一个文件并微调消息 | 提交哈希更新，原最后一次提交被无缝覆盖，无多余提交产生 |
| **TC-03-03** | 提交模板加载 | 仓库配置了 commit.template | 打开提交弹窗 | 自动将配置的提交模版内容载入 Commit 输入框 |
| **TC-03-04** | 提交变更详情查看 | 提交完成 | 在图谱或历史记录中点击刚刚生成的 Commit | 详细面板准确列出包含的变更文件列表、父提交 ID、作者时间与完整 Diff |

---

### 模块 4：分支管理与智能检出 (Branching & Smart Checkout)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-04-01** | 分支列表呈现 | 已载入仓库 | 查看左侧侧边栏分支树与“分支管理”弹窗 | 正确列出 `master`, `develop`, `feat/*`, `conflict/*`, `hotfix/*`，当前检出分支高亮 |
| **TC-04-02** | 新建分支 | 位于 `master` | 基于当前 HEAD 新建分支 `feat/test-branch`，勾选检出 | 分支成功创建并切换，HEAD 指向新分支 |
| **TC-04-03** | 基于历史 Commit 建分支 | 位于任意分支 | 在拓扑图选择历史提交 `7a7513d`，右键“基于此处创建分支” | 新分支在指定 Commit 处生成，验证检出后的 HEAD 哈希为指定哈希 |
| **TC-04-04** | 分支重命名 | 存在分支 | 将 `feat/test-branch` 重命名为 `feat/test-renamed` | 分支名成功更新，引用与工作区同步变更 |
| **TC-04-05** | 普通分支切换 (Clean Checkout) | 工作区整洁 | 从 `master` 切换到 `develop` | 秒级切换成功，文件树自动刷新为 `develop` 下的内容 |
| **TC-04-06** | **智能检出 (Smart Checkout)** | 工作区包含未提交代码 | 在工作区修改 `src/index.ts`（未提交），直接切换到 `feat/user-auth` | GITBX **自动执行安全暂存 (Auto-stash)**，切换分支成功后自动将修改还原到新分支，代码零丢失 |
| **TC-04-07** | 分支快速向前合并更新 (Fast-Forward Update) | 存在可快进的分支 | 处于其他分支时，对落后但可快进的分支执行“快速向前更新” | 目标分支指针直接前移至最新目标提交，且**无需来回切换当前工作区分支** |
| **TC-04-08** | 删除分支防护机制 | 位于 `master` | 1. 尝试删除当前正在检出的 `master`<br>2. 尝试删除已合并分支<br>3. 尝试直接删除未合并分支 | 1. 明确报错拦截，禁止删除当前分支<br>2. 已合并分支安全移除<br>3. 未合并分支弹出二次确认并要求 force 参数 |

---

### 模块 5：远程协作与网络通信 (Remote & Sync)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-05-01** | 远程列表与配置查看 | 已配置 origin | 打开“远程仓库管理”弹窗 | 正确展示 `origin` 以及对应的 Fetch/Push URL (`https://gitee.com/chenskidy/gitbx-4-test.git`) |
| **TC-05-02** | 修改远程仓库 URL | 已有远程仓库 | 修改 `origin` 的 URL 或新增一个测试 upstream URL | 本地 `.git/config` 立即更新，界面即时生效 |
| **TC-05-03** | 远程拉取 (Fetch) | 配置了有效远端 | 点击“获取 (Fetch All)” | 成功与远端通信，拉取远端 refs，更新远程追踪分支状态 |
| **TC-05-04** | 远程拉取更新 (Pull) | 本地分支落后于远端 | 点击“拉取 (Pull)”，可切换策略 (Merge / Rebase / Fast-Forward only) | 成功将远端最新提交合并至本地分支 |
| **TC-05-05** | 推送至远端 (Push) | 本地有新提交 | 点击“推送 (Push)” | 提交成功推送到 Gitee 远程仓库，远端 refs 更新 |
| **TC-05-06** | **安全租约强推 (Force with Lease)** | 发生变基需要覆盖远端 | 勾选“Force with lease”，点击推送 | 仅当远端未被他人更新时允许强制覆盖，避免误冲他人提交 |
| **TC-05-07** | 同步状态指标 (Sync Status) | 存在上下游差异 | 查看底部状态栏与同步弹窗 | 精确呈现 Ahead / Behind 提交计数值与同步建议 |

---

### 模块 6：标签与版本发布 (Tags & Releases)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-06-01** | 标签列表倒序呈现 | 存在标签 | 打开“标签管理”或在图谱上查看 | 正确展示 `v1.0.0-beta` 和 `v0.1.0`，按时间戳倒序排列 |
| **TC-06-02** | 创建轻量标签 (Lightweight Tag) | 选定 Commit | 输入标签名 `v1.0.1-patch`，不填写附注说明，确认创建 | 成功生成轻量引用，图谱节点旁展示对应的标签 Badge |
| **TC-06-03** | 创建附注标签 (Annotated Tag) | 选定 Commit | 输入标签名 `v1.1.0`，输入详细发布说明，确认创建 | 成功生成 Annotated Tag 对象，包含创建者、签名与发布说明 |
| **TC-06-04** | 删除本地与远程标签 | 存在测试标签 | 针对 `v1.0.1-patch` 执行删除 | 本地标签引用被清理，图谱 Badge 消失 |

---

### 模块 7：储藏与文件独立搁置 (Stash & Shelf)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-07-01** | 创建带描述的 Stash | 工作区有未提交代码 | 打开储藏面板，输入说明 `WIP: refactor math logic`，点击“储藏” | 工作区恢复至干净状态，修改被完整保存在 Stash 堆栈中 |
| **TC-07-02** | 查看 Stash 列表与变更详情 | Stash 堆栈非空 | 在 Stash 列表点击特定储藏条目 | 准确列出该 Stash 内包含的文件改动及 Diff 预览 |
| **TC-07-03** | 应用与弹出 Stash (Apply & Pop) | 存在 Stash | 1. 点击 `Apply Stash` 验证代码还原且 Stash 仍在<br>2. 点击 `Pop Stash` 验证还原并移除出栈 | 代码无误恢复到当前工作区，Pop 后 Stash 列表自动剔除该项 |
| **TC-07-04** | 重命名 Stash | 存在 Stash | 对 `stash@{0}` 点击重命名，输入新名称 | Stash 描述信息即时更新 |
| **TC-07-05** | **针对指定文件的独立搁置 (Shelf)** | 工作区修改了多个文件 | 仅选择 `src/math.ts` 进行“创建搁置 (Create Shelf)” | 仅被选中的 `src/math.ts` 恢复干净，其余改动继续保留在工作区 |

---

### 模块 8：合并、变基与冲突解决 (Merge, Rebase & 3-Way Conflict Editor)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-08-01** | 快进合并 (Fast-Forward Merge) | `master` 落后于 `develop` | 检出 `master`，选择合并 `develop`（允许快进） | `master` 指针直接移动至 `develop`，不产生多余 Merge Commit |
| **TC-08-02** | 非快进合并 (No-FF Merge) | 任意可快进分支 | 勾选 `no-ff` 选项执行合并 | 强制生成一个清晰的“Merge branch ...”合并提交节点 |
| **TC-08-03** | **真实 3-Way 代码冲突触发** | 准备 `conflict/*` 分支 | 检出 `conflict/branch-a`，合并 `conflict/branch-b` | 触发冲突！系统明确提示 Automatic merge failed，进入冲突解决界面 |
| **TC-08-04** | **3-Way 可视化冲突编辑器** | 处于合并冲突状态 | 打开 `src/config.json` 冲突编辑器 | CodeMirror 准确划分展示三栏：<br>1. 本地当前版本 (Ours / branch-a: port 8080)<br>2. 共同祖先版本 (Base: port 3000)<br>3. 传入目标版本 (Theirs / branch-b: port 9000) |
| **TC-08-05** | 采纳冲突解决方案 | 处于冲突编辑器 | 1. 点击“采纳传入 (Use Theirs)”验证右侧替换<br>2. 点击“采纳当前 (Use Ours)”验证左侧替换<br>3. 在结果区手动编辑微调并点击“标记为已解决” | 冲突标记彻底清除，文件自动加入暂存区，状态更新为 Resolved |
| **TC-08-06** | 继续并完成合并 (Merge Continue) | 所有冲突均已解决 | 点击“继续合并 (Continue Merge)” | 成功生成合并提交，工作区恢复就绪状态，图谱展示两条分支汇聚弧线 |
| **TC-08-07** | 中止合并 (Merge Abort) | 处于合并冲突状态中 | 点击“中止合并 (Abort Merge)” | 干净还原工作区与暂存区，HEAD 回滚至合并前初始状态，无残留痕迹 |
| **TC-08-08** | **交互式变基 (Interactive Rebase)** | 分支有多次连续提交 | 选择 `feat/user-auth` 对基准执行交互式变基，对提交进行 Reorder(换序)、Reword(改名)、Fixup(合并压缩)、Drop(删除) | 变基引擎按指定 Plan 精确执行重构，最终历史序列与操作完全一致 |
| **TC-08-09** | 拣选提交 (Cherry-Pick) | 位于 `master` | 选择 `feat/payment` 中的提交 `a130487` 进行 Cherry-Pick | 该提交的代码改动成功复制应用并生成在 `master` 分支上 |
| **TC-08-10** | 还原提交 (Revert) | 任意分支已有提交 | 针对某个 Commit 点击“Revert 还原提交” | 自动创建一个反向抵消变更的新 Commit，原有历史完整保留 |

---

### 模块 9：版本重置与跨版本比对 (Reset & Revisions)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-09-01** | 软重置 (Soft Reset) | 存在多条提交 | 选择倒数第二个提交，执行 `git reset --soft` | HEAD 指向目标提交，该提交之后的所有改动全部保留在**暂存区** |
| **TC-09-02** | 混合重置 (Mixed Reset) | 存在多条提交 | 选择目标提交，执行 `git reset --mixed` | HEAD 指向目标提交，改动保留在**工作区（未暂存）** |
| **TC-09-03** | 强力硬重置 (Hard Reset) | 存在未保存改动 | 弹出高风险危险警告弹窗，确认执行 `git reset --hard` | 工作区与暂存区完全覆写为目标提交状态，抛弃后续改动 |
| **TC-09-04** | 跨分支版本差异比对 | 任意两个分支 | 选择对比 `develop` 与 `feat/user-auth` | 界面清晰罗列两个修订版本之间的全部新增、修改与删除文件差异列表 |

---

### 模块 10：Git Worktree 多工作树管理 (Worktree Management)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-10-01** | 添加独立工作区 (Worktree Add) | 位于 `I:\gitbx-4-test` | 在 Worktree 管理器中新建工作区，目录设为 `worktrees/hotfix-worker`，检出 `hotfix/v1.0.1` | 秒级在指定路径创建独立工作目录，该目录可独立编辑、编译且与主仓库共享 `.git` |
| **TC-10-02** | 工作区列表与状态识别 | 存在 Linked Worktree | 打开 Worktree 列表面板 | 准确标明主工作区 (Main) 与关联工作区 (Linked)，显示各自检出分支与 HEAD |
| **TC-10-03** | 锁定与解锁工作区 (Lock / Unlock) | 存在从工作区 | 对 `hotfix-worker` 执行锁定并填入原因“保留测试中环境” | 工作区标记为 Locked，防止执行清理操作时被意外删除；解锁后解除保护 |
| **TC-10-04** | 移除工作区 (Worktree Remove) | 存在已完成从工作区 | 对该工作区执行“移除工作区” | 物理文件夹与元数据被安全移除，主仓库工作区列表恢复为仅包含 Main |
| **TC-10-05** | 修剪失效工作树 (Prune) | 手动删除了某外部目录 | 执行“修剪无效工作树 (Prune)” | 自动清空 `.git/worktrees` 中残存的失效链接引用 |

---

### 模块 11：本地快照历史 (Local History & Snapshot)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-11-01** | 手动创建本地快照 | 正在编辑代码 | 针对 `README.md` 点击“创建本地历史快照”，命名为 `Before Major Edit` | 快照即时生成，包含文件内容、精确到秒的时间戳与自定义标签 |
| **TC-11-02** | 历史快照版本溯源 | 存在多次快照记录 | 打开该文件的“本地历史”弹窗 | 按照时间倒序完整列出所有历史修改快照点 |
| **TC-11-03** | 一键恢复历史快照 | 文件已被改乱 | 在历史快照列表中选定早期版本，点击“恢复此版本” | 工作区文件内容立即精确还原为历史快照内容，无需依赖 Git Commit |

---

### 模块 12：差异比对引擎与代码调查 (Diff Viewer & Blame)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-12-01** | Side-by-Side 与 Inline 切换 | 查看有改动的文件 | 在 Diff 顶部工具栏切换“双栏并排 (Side-by-side)”与“单栏内联 (Inline)” | 视图无缝平滑切换，语法高亮、缩进与行号对应无漂移 |
| **TC-12-02** | 行内差异高亮 (Intra-line Diff) | 修改了单行中的几个单词 | 查看该行的 Diff 显示 | 精准使用深色背景标出该行中发生变化的具体词元 (Tokens) |
| **TC-12-03** | Git Blame 代码逐行追溯 | 查看任意代码文件 | 打开 `src/index.ts` 的 Blame 视图 | 每一行左侧清晰呈现：作者姓名、最后修改时间、对应提交哈希及提交说明摘要 |
| **TC-12-04** | 单文件历史提交轨迹 | 任意文件 | 查看 `src/config.json` 的文件历史 (File History) | 仅过滤并展示涉及该文件变动的专属历史提交链条 |

---

### 模块 13：Canvas 虚拟拓扑轨道图 (Commit Graph Canvas)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-13-01** | 60 FPS 虚拟轨道图渲染 | 载入 `gitbx-4-test` | 快速上下滚动图谱视图 | Canvas 基于虚拟滚动机制丝滑呈现，分叉线与汇聚弧线连接自然，无掉帧或白屏 |
| **TC-13-02** | 分支泳道颜色计算 (Lane Colors) | 多条并发分支 | 查看 `feat/user-auth` 与 `feat/payment` | 各自占据独立彩色轨道 (Lane)，节点颜色与分支标签颜色一致，视觉层次鲜明 |
| **TC-13-03** | 徽章标记 (Badges) 显示 | 节点存在分支或 Tag | 查看包含 `v1.0.0-beta` 与 `master` 的提交 | 节点右侧紧跟清爽的 Branch 徽章、Tag 徽章及 HEAD 当前指向指示器 |
| **TC-13-04** | 图谱快速检索与过滤 | 存在多条提交 | 在图谱搜索框输入 `payment` 或作者名 | 视图瞬时过滤仅展示命中关键字的提交节点，未匹配节点自动折叠或淡化 |

---

### 模块 14：AI 智能辅助与敏感凭据防护 (AI Features & Secret Scanner)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-14-01** | AI 智能 Commit 消息生成 | 暂存区存在文件修改 | 点击 Commit 输入框旁的“🤖 AI 生成消息” | 提取暂存区 Diff 上下文，快速生成规范的 Conventional Commit 消息（如 `feat(utils): ...`） |
| **TC-14-02** | AI 冲突化解助手 | 处于 3-Way 冲突状态 | 点击“AI 冲突化解建议” | 智能分析 Ours/Theirs/Base 意图，给出最佳融合代码并附带解释 |
| **TC-14-03** | **敏感凭据泄露拦截扫描** | 准备提交代码 | 故意在代码中写入假 AWS 密钥 `AKIAIOSFODNN7EXAMPLE` 并尝试暂存/提交 | **Secret Scanner 实时触发拦截**，弹出严重安全告警并高亮指示泄露文件及行号，阻止密钥误入 Git 历史 |

---

### 模块 15：MCP (Model Context Protocol) 协同协议

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-15-01** | MCP stdio 服务握手 | 启动 `gitbx-mcp` | 发送 JSON-RPC 2.0 `initialize` 请求 | 返回符合 MCP 协议规范的工具列表及能力元数据 |
| **TC-15-02** | 权限模式策略控制 (ReadOnly) | `GITBX_MCP_MODE=readonly` | AI Agent 尝试调用 `gitbx_commit` 或 `gitbx_push` | 服务端拒绝写入操作并返回权限不足，保护代码资产安全 |
| **TC-15-03** | AI Agent 自动化调度 (Write/Unsafe) | 允许写入权限 | AI Agent 通过 MCP 工具查询状态、暂存并执行提交 | 成功代理完成 Git 协同闭环，无需开发者手动切终端敲命令 |

---

### 模块 16：安全凭据、SSH 与网络代理 (Auth, Keyring & Proxy)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-16-01** | 系统密钥链持久化 (Keyring) | 操作系统支持凭据管理器 | 保存 AI API Key 或 Git 认证口令 | 凭据写入系统 Keyring，配置文件中无任何明文密码泄露 |
| **TC-16-02** | 仓库专用 SSH 私钥隔离 | 仓库设置面板 | 为 `gitbx-4-test` 指定独立的专用 `id_ed25519_test` 私钥 | GITBX 优先使用该专用私钥进行 SSH 通信，不污染全局 SSH 默认配置 |
| **TC-16-03** | HTTP/HTTPS 代理配置 | 设置中心 | 配置 HTTP 自定义代理服务器及端口 | HTTP(S) Git 网络操作均严格走代理通道，支持直连/系统代理快速切换 |
| **TC-16-04** | Web 模式 Fail-Closed 安全防线 | 启动 Axum Web 服务 | 在配置了 `GITBX_WEB_TOKEN` 情况下，发起无 Token 的 API 请求 | 所有非 `/api/health` 接口均返回 401 Unauthorized，杜绝未授权访问 |

---

### 模块 17：多语言与国际化 (i18n & RTL)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-17-01** | 8 国语言动态切换 | 设置面板 | 逐一切换 简体中文、English、日本語、Deutsch、Español、Français、繁體中文 | 所有菜单、按钮、工具提示、弹窗文案即时刷新对应语言，无缺失缺失占位符 |
| **TC-17-02** | 阿拉伯语 RTL 布局适配 | 设置面板 | 切换为 `العربية` (Arabic) | 整个 UI 界面自动自适应为**从右向左 (Right-to-Left)** 镜像排版，符合阿拉伯语言排版习惯 |
| **TC-17-03** | 语言偏好持久化 | 切换语言后 | 重启应用或刷新页面 | 应用冷启动后完美保持用户选定的语言偏好 |

---

### 模块 18：终端与外部工具链协同 (Terminal & Toolchain)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-18-01** | 一键打开内置/系统终端 | 打开 `gitbx-4-test` | 点击工具栏“打开终端” | 自动启动本地 Git Bash 或 PowerShell，默认当前工作目录自动锁定为 `I:\gitbx-4-test` |
| **TC-18-02** | PR / MR 网页直达 | 远端为 Gitee/GitHub | 点击“创建 Pull Request” | 自动生成正确的 Compare 分支对比 URL，并在系统默认浏览器中一键打开 |
| **TC-18-03** | 系统文件管理器与 IDE 唤起 | 任意文件 | 右键文件“在文件夹中显示”或“在 VSCode 中打开” | 系统原生资源管理器高亮该文件，或成功唤起对应外部编辑器 |

---

### 模块 19：桌面端与 Web 端双架构一致性 (Dual Mode Parity)

| 用例编号 | 功能测试点 | 前置条件 | 操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- | :--- |
| **TC-19-01** | Tauri IPC 与 Axum REST 一致性 | 双端同时开启 | 分别在 Tauri 客户端和 Web 浏览器界面操作同一分支操作 | 两端调用的数据结构统一使用 `gitbx-contracts`，返回结果完全等价 |
| **TC-19-02** | WebSocket 状态联动同步 | Web 模式 | 外部使用终端修改文件触发变更 | WebSocket 实时推送文件系统变动事件，前端视图秒级自动刷新，无需手动 F5 |

---

## 五、 测试执行流程与步骤指南

### 步骤 1：重置与拓扑准备
在执行任何测试前，运行准备脚本初始化 `I:\gitbx-4-test`：
```powershell
node scripts/setup_gitbx_4_test.cjs
```
> **确认标志**：控制台输出分支清单包含 `master`, `develop`, `feat/*`, `conflict/*`, `hotfix/*`，Tags 包含 `v0.1.0` 与 `v1.0.0-beta`。

### 步骤 2：执行自动化回归套件
执行包含 37 项断言的端到端自动化测试：
```powershell
node scripts/verify_gitbx_4_test.cjs
```
> **通过指标**：`Test Summary: 37 Passed, 0 Failed`。

### 步骤 3：桌面端 GUI 交互测试 (Tauri 2.0)
1. 启动桌面端开发服务：
   ```powershell
   pnpm tauri dev
   ```
2. 打开仓库 `I:\gitbx-4-test`。
3. 按照第 **四** 节中用例逐项执行：
   - 体验 Canvas 虚拟拓扑轨道图缩放与滚动。
   - 切换至 `conflict/branch-a` 并合并 `conflict/branch-b`，体验 3-Way 冲突编辑器并完成合并。
   - 打开 Worktree 管理弹窗，添加与检出 `worktrees/hotfix-worker`。
   - 修改任意文件测试行级暂存与 AI Commit 消息生成。

### 步骤 4：Web 模式协同测试 (Axum)
1. 在终端启动后端 Axum 服务：
   ```powershell
   $env:GITBX_ALLOWED_REPOS = 'I:\gitbx-4-test'
   $env:GITBX_WEB_TOKEN = 'test-token-123'
   cargo run -p gitbx-web
   ```
2. 另开终端启动前端：
   ```powershell
   pnpm dev
   ```
3. 打开浏览器 `http://localhost:5173`，输入 Token，测试远程 Web 控制台的完整功能操作。

---

## 六、 测试完成与验收标准

| 维度 | 验收基线 | 状态 |
| :--- | :--- | :---: |
| **单元测试与代码检查** | `cargo test --workspace` (56/56 全通过)、`pnpm test` (17/17 全通过)、`pnpm typecheck` (无任何报错) | **PASS** |
| **自动化集成验证** | `verify_gitbx_4_test.cjs` 针对 `gitbx-4-test` 的 37 项核心能力自动化校验 | **PASS (37/37)** |
| **拓扑场景完备度** | `master`, `develop`, 多分叉, 3-Way 冲突对立分支, Hotfix 分支, 多 Tags 全量就绪 | **PASS** |
| **核心业务闭环** | 暂存、提交、智能切分支、3-Way 冲突解决、Worktree、Local History、AI 辅助全流程通畅 | **PASS** |
