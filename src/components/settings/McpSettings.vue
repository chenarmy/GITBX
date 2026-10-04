<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  ShieldCheck,
  Server,
  Terminal,
  Copy,
  Check,
  Save,
  CheckCircle2,
  FolderGit2,
  Lock,
} from 'lucide-vue-next';
import { loadMcpPolicy, saveMcpPolicy, getMcpServerInfo } from '@/api/domain/mcpApi';
import type {
  McpPolicyConfig,
  McpServerInfo,
} from '@/types/mcp';
import { useRepoStore } from '@/stores/repo';
import { useNotificationStore } from '@/stores/notification';

const repoStore = useRepoStore();
const notification = useNotificationStore();

const activeSubTab = ref<'wizard' | 'clients'>('wizard');
const wizardStep = ref<number>(1);
const copiedClient = ref<string | null>(null);
const isSaving = ref(false);

const serverInfo = ref<McpServerInfo>({
  policy_path: '~/.gitbx/mcp-policy.json',
  binary_command: 'gitbx-mcp',
  available_tools: [],
  streamable_http_url: 'http://127.0.0.1:5226/mcp',
});

const policy = ref<McpPolicyConfig>({
  version: 1,
  global_level: 'safe_write',
  allow_all_repos: true,
  allowed_repos: [],
  enabled_tools: [
    'gitbx_list_repos',
    'gitbx_status',
    'gitbx_branches',
    'gitbx_log',
    'gitbx_tags',
    'gitbx_diff',
    'gitbx_stage_file',
    'gitbx_stage_all',
    'gitbx_commit',
    'gitbx_create_branch',
    'gitbx_fetch',
  ],
  allow_active_repo_fallback: true,
});

const defaultBranchTags = ['main', 'master', 'release/*', 'prod/*'];

onMounted(async () => {
  try {
    const [loadedPolicy, info] = await Promise.all([
      loadMcpPolicy(),
      getMcpServerInfo(),
    ]);
    policy.value = loadedPolicy;
    serverInfo.value = info;

    // Sync any known repos from repoStore into allowed_repos if not present
    if (repoStore.activeRepoPath) {
      ensureRepoRule(repoStore.activeRepoPath);
    }
  } catch (err: any) {
    console.error('Failed to load MCP policy:', err);
  }
});

function ensureRepoRule(repoPath: string) {
  const exists = policy.value.allowed_repos.some((r) => r.repo_path === repoPath);
  if (!exists) {
    policy.value.allowed_repos.push({
      repo_path: repoPath,
      protected_branches: [...defaultBranchTags],
      allow_remote_fetch: true,
      allow_remote_push: false,
      allow_force_push: false,
    });
  }
}

const managedRepos = computed(() => {
  const list = new Set<string>();
  if (repoStore.activeRepoPath) list.add(repoStore.activeRepoPath);
  policy.value.allowed_repos.forEach((r) => list.add(r.repo_path));
  return Array.from(list);
});

function isRepoSelected(path: string): boolean {
  if (policy.value.allow_all_repos) return true;
  return policy.value.allowed_repos.some((r) => r.repo_path === path);
}

function toggleRepoSelection(path: string) {
  if (policy.value.allow_all_repos) {
    policy.value.allow_all_repos = false;
  }
  const idx = policy.value.allowed_repos.findIndex((r) => r.repo_path === path);
  if (idx >= 0) {
    policy.value.allowed_repos.splice(idx, 1);
  } else {
    policy.value.allowed_repos.push({
      repo_path: path,
      protected_branches: [...defaultBranchTags],
      allow_remote_fetch: true,
      allow_remote_push: false,
      allow_force_push: false,
    });
  }
}

function isToolEnabled(name: string): boolean {
  return policy.value.enabled_tools.includes(name);
}

function toggleTool(name: string) {
  const idx = policy.value.enabled_tools.indexOf(name);
  if (idx >= 0) {
    policy.value.enabled_tools.splice(idx, 1);
  } else {
    policy.value.enabled_tools.push(name);
  }
}

async function handleSave() {
  isSaving.value = true;
  try {
    await saveMcpPolicy(policy.value);
    notification.success('MCP 策略已保存', '连接与权限设置已统一更新并即时对所有客户端生效。');
  } catch (err: any) {
    notification.error('保存失败', err?.message || String(err));
  } finally {
    isSaving.value = false;
  }
}

// Client config generator
const clients = [
  { id: 'claude_code', name: 'Claude Code', type: 'CLI' },
  { id: 'cursor', name: 'Cursor', type: 'IDE / Stdio' },
  { id: 'vscode', name: 'VS Code (Cline / Roo / Continue)', type: 'IDE / Stdio' },
  { id: 'windsurf', name: 'Windsurf', type: 'IDE / Stdio' },
  { id: 'trae', name: 'TRAE', type: 'IDE / Stdio' },
  { id: 'zcode', name: 'ZCode', type: 'IDE / Stdio' },
  { id: 'codebuddy', name: 'CodeBuddy Code', type: 'IDE / Stdio' },
  { id: 'cherry_studio', name: 'Cherry Studio', type: 'Desktop App' },
  { id: 'qoder', name: 'Qoder', type: 'Desktop App' },
  { id: 'workbuddy', name: 'WorkBuddy', type: 'Desktop App' },
  { id: 'codex', name: 'Codex', type: 'HTTP / SSE' },
  { id: 'deepseek_harness', name: 'DeepSeek Harness', type: 'HTTP / SSE' },
  { id: 'opencode', name: 'OpenCode', type: 'HTTP / SSE' },
];

function getClientConfig(clientId: string): string {
  if (clientId === 'claude_code') {
    return 'claude mcp add gitbx gitbx-mcp';
  }
  if (['codex', 'deepseek_harness', 'opencode'].includes(clientId)) {
    return JSON.stringify(
      {
        mcpServers: {
          gitbx: {
            url: serverInfo.value.streamable_http_url,
          },
        },
      },
      null,
      2,
    );
  }
  // Standard JSON format
  return JSON.stringify(
    {
      mcpServers: {
        gitbx: {
          command: 'gitbx-mcp',
          args: [],
        },
      },
    },
    null,
    2,
  );
}

function copyConfig(clientId: string) {
  const text = getClientConfig(clientId);
  navigator.clipboard.writeText(text);
  copiedClient.value = clientId;
  setTimeout(() => {
    copiedClient.value = null;
  }, 2000);
  notification.success('配置已复制', '已复制到剪贴板，可直接粘贴到客户端对应配置中。');
}
</script>

<template>
  <div class="space-y-4">
    <!-- Top banner / Status bar -->
    <div class="bg-card border border-border rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Server class="w-4 h-4" />
        </div>
        <div>
          <div class="font-semibold text-foreground flex items-center gap-2">
            GITBX MCP Server
            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              运行中 (stdio 响应)
            </span>
          </div>
          <div class="text-muted-foreground text-[11px] mt-0.5">
            策略路径: <code class="font-mono bg-muted px-1 py-0.5 rounded">{{ serverInfo.policy_path }}</code>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          @click="activeSubTab = 'wizard'"
          class="px-2.5 py-1.5 rounded-md font-medium text-xs transition"
          :class="activeSubTab === 'wizard' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-foreground'"
        >
          <ShieldCheck class="w-3.5 h-3.5 inline mr-1" />
          权限与范围向导
        </button>
        <button
          type="button"
          @click="activeSubTab = 'clients'"
          class="px-2.5 py-1.5 rounded-md font-medium text-xs transition"
          :class="activeSubTab === 'clients' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-foreground'"
        >
          <Terminal class="w-3.5 h-3.5 inline mr-1" />
          13 款客户端接入
        </button>
      </div>
    </div>

    <!-- SUB-TAB 1: 4-STEP WIZARD -->
    <div v-show="activeSubTab === 'wizard'" class="space-y-4">
      <!-- Steps Indicator -->
      <div class="grid grid-cols-4 gap-2 text-center text-xs">
        <button
          type="button"
          @click="wizardStep = 1"
          class="p-2 rounded-lg border text-left transition flex items-center gap-2"
          :class="wizardStep === 1 ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card text-muted-foreground'"
        >
          <div class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
               :class="wizardStep === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'">
            1
          </div>
          <div class="truncate">
            <div class="font-medium">默认权限</div>
            <div class="text-[10px] text-muted-foreground truncate">全局基线与操作矩阵</div>
          </div>
        </button>

        <button
          type="button"
          @click="wizardStep = 2"
          class="p-2 rounded-lg border text-left transition flex items-center gap-2"
          :class="wizardStep === 2 ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card text-muted-foreground'"
        >
          <div class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
               :class="wizardStep === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'">
            2
          </div>
          <div class="truncate">
            <div class="font-medium">仓库可见性</div>
            <div class="text-[10px] text-muted-foreground truncate">授权白名单控制</div>
          </div>
        </button>

        <button
          type="button"
          @click="wizardStep = 3"
          class="p-2 rounded-lg border text-left transition flex items-center gap-2"
          :class="wizardStep === 3 ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card text-muted-foreground'"
        >
          <div class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
               :class="wizardStep === 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'">
            3
          </div>
          <div class="truncate">
            <div class="font-medium">分支与远程</div>
            <div class="text-[10px] text-muted-foreground truncate">主分支保护与推送锁</div>
          </div>
        </button>

        <button
          type="button"
          @click="wizardStep = 4"
          class="p-2 rounded-lg border text-left transition flex items-center gap-2"
          :class="wizardStep === 4 ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card text-muted-foreground'"
        >
          <div class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
               :class="wizardStep === 4 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'">
            4
          </div>
          <div class="truncate">
            <div class="font-medium">汇总与确认</div>
            <div class="text-[10px] text-muted-foreground truncate">工具开关与策略矩阵</div>
          </div>
        </button>
      </div>

      <!-- Step 1: Default Permission -->
      <div v-if="wizardStep === 1" class="border border-border rounded-lg bg-card p-4 space-y-4">
        <div>
          <div class="text-sm font-semibold text-foreground">MCP 全局默认权限</div>
          <div class="text-xs text-muted-foreground mt-0.5">
            设置未单独配置仓库时使用的默认级别。单个仓库的专属设置可覆盖此默认值，但不会扩大仓库的可见范围。
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <!-- Read Only -->
          <div
            @click="policy.global_level = 'read_only'"
            class="p-3 rounded-lg border cursor-pointer transition select-none flex flex-col justify-between"
            :class="policy.global_level === 'read_only' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-border/80 bg-muted/20'"
          >
            <div>
              <div class="font-semibold text-foreground flex items-center justify-between">
                只读 (ReadOnly)
                <CheckCircle2 v-if="policy.global_level === 'read_only'" class="w-4 h-4 text-primary" />
              </div>
              <p class="text-muted-foreground text-[11px] mt-1">仅允许状态查询、日志检索、分支查阅与代码差异比对。零副作用。</p>
            </div>
            <div class="mt-2 text-[10px] text-muted-foreground/80 font-mono">
              status, log, diff, branches, tags
            </div>
          </div>

          <!-- Safe Write -->
          <div
            @click="policy.global_level = 'safe_write'"
            class="p-3 rounded-lg border cursor-pointer transition select-none flex flex-col justify-between"
            :class="policy.global_level === 'safe_write' ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30' : 'border-border hover:border-border/80 bg-muted/20'"
          >
            <div>
              <div class="font-semibold text-foreground flex items-center justify-between">
                安全读写 (推荐)
                <CheckCircle2 v-if="policy.global_level === 'safe_write'" class="w-4 h-4 text-primary" />
              </div>
              <p class="text-muted-foreground text-[11px] mt-1">允许暂存、规范提交、创建特性分支及拉取。严禁在受保护主分支直接提交，阻断强推与硬重置。</p>
            </div>
            <div class="mt-2 text-[10px] text-emerald-500 font-medium">
              推荐：适合日常结对开发
            </div>
          </div>

          <!-- Full Access -->
          <div
            @click="policy.global_level = 'full_access'"
            class="p-3 rounded-lg border cursor-pointer transition select-none flex flex-col justify-between"
            :class="policy.global_level === 'full_access' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-border/80 bg-muted/20'"
          >
            <div>
              <div class="font-semibold text-foreground flex items-center justify-between">
                完全访问 (FullAccess)
                <CheckCircle2 v-if="policy.global_level === 'full_access'" class="w-4 h-4 text-primary" />
              </div>
              <p class="text-muted-foreground text-[11px] mt-1">开放高级分支合并、变基、挑选提交、历史重置与远程推送。仍受底层分支保护锁约束。</p>
            </div>
            <div class="mt-2 text-[10px] text-amber-500 font-medium">
              包含高危运维重写命令
            </div>
          </div>
        </div>

        <!-- Capability Comparison Table -->
        <div class="mt-4 border border-border rounded-md overflow-hidden text-[11px]">
          <div class="bg-muted/50 px-3 py-2 font-medium border-b border-border text-foreground">
            权限能力对照表
          </div>
          <table class="w-full text-left divide-y divide-border">
            <thead>
              <tr class="bg-muted/20 text-muted-foreground">
                <th class="px-3 py-1.5 font-medium">操作能力</th>
                <th class="px-3 py-1.5 font-medium text-center">只读</th>
                <th class="px-3 py-1.5 font-medium text-center">安全读写</th>
                <th class="px-3 py-1.5 font-medium text-center">完全访问</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border text-muted-foreground">
              <tr>
                <td class="px-3 py-1.5 text-foreground">状态与历史查阅 (status, log, diff, branches)</td>
                <td class="px-3 py-1.5 text-center text-emerald-500">✔</td>
                <td class="px-3 py-1.5 text-center text-emerald-500">✔</td>
                <td class="px-3 py-1.5 text-center text-emerald-500">✔</td>
              </tr>
              <tr>
                <td class="px-3 py-1.5 text-foreground">工作区暂存与规范提交 (stage, commit)</td>
                <td class="px-3 py-1.5 text-center text-red-400">✖</td>
                <td class="px-3 py-1.5 text-center text-emerald-500">✔ (限非保护分支)</td>
                <td class="px-3 py-1.5 text-center text-emerald-500">✔</td>
              </tr>
              <tr>
                <td class="px-3 py-1.5 text-foreground">创建新开发分支 (create_branch)</td>
                <td class="px-3 py-1.5 text-center text-red-400">✖</td>
                <td class="px-3 py-1.5 text-center text-emerald-500">✔</td>
                <td class="px-3 py-1.5 text-center text-emerald-500">✔</td>
              </tr>
              <tr>
                <td class="px-3 py-1.5 text-foreground">合并、变基与历史重置 (merge, rebase, reset)</td>
                <td class="px-3 py-1.5 text-center text-red-400">✖</td>
                <td class="px-3 py-1.5 text-center text-red-400">✖</td>
                <td class="px-3 py-1.5 text-center text-emerald-500">✔</td>
              </tr>
              <tr>
                <td class="px-3 py-1.5 text-foreground">远程推送 (push)</td>
                <td class="px-3 py-1.5 text-center text-red-400">✖</td>
                <td class="px-3 py-1.5 text-center text-red-400">✖</td>
                <td class="px-3 py-1.5 text-center text-emerald-500">✔ (禁强推)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Step 2: Repository Scope -->
      <div v-if="wizardStep === 2" class="border border-border rounded-lg bg-card p-4 space-y-4">
        <div>
          <div class="text-sm font-semibold text-foreground">MCP 可见的仓库范围</div>
          <div class="text-xs text-muted-foreground mt-0.5">
            未勾选的仓库对 MCP 客户端彻底隐身；即使客户端通过参数指定未授权仓库路径，GITBX 也会实时拦截。
          </div>
        </div>

        <div class="flex items-center gap-4 text-xs">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              :checked="policy.allow_all_repos"
              @change="policy.allow_all_repos = true"
              class="rounded text-primary"
            />
            <span class="text-foreground font-medium">所有受管仓库 (自动开放)</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              :checked="!policy.allow_all_repos"
              @change="policy.allow_all_repos = false"
              class="rounded text-primary"
            />
            <span class="text-foreground font-medium">仅限已勾选的白名单仓库</span>
          </label>
        </div>

        <!-- Repos List -->
        <div class="border border-border rounded-md divide-y divide-border bg-muted/10 max-h-48 overflow-y-auto">
          <div
            v-for="repoPath in managedRepos"
            :key="repoPath"
            class="px-3 py-2 flex items-center justify-between text-xs hover:bg-muted/30 transition"
          >
            <div class="flex items-center gap-2 truncate">
              <input
                type="checkbox"
                :disabled="policy.allow_all_repos"
                :checked="isRepoSelected(repoPath)"
                @change="toggleRepoSelection(repoPath)"
                class="rounded text-primary"
              />
              <FolderGit2 class="w-4 h-4 text-primary shrink-0" />
              <span class="font-mono text-foreground truncate">{{ repoPath }}</span>
            </div>
            <span class="text-[11px] text-muted-foreground shrink-0 ml-2">
              {{ repoPath === repoStore.activeRepoPath ? '(当前聚焦仓库)' : '' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Step 3: Branch Protection & Remote Policy -->
      <div v-if="wizardStep === 3" class="border border-border rounded-lg bg-card p-4 space-y-4">
        <div>
          <div class="text-sm font-semibold text-foreground">分支保护与远程策略</div>
          <div class="text-xs text-muted-foreground mt-0.5">
            受保护分支规则命中时，即使全局赋予了写权限，AI 提交也会被强制拦截，并引导 AI 派生特性分支。
          </div>
        </div>

        <!-- Default Protected Branches -->
        <div class="space-y-2">
          <label class="text-xs font-medium text-foreground flex items-center gap-1.5">
            <Lock class="w-3.5 h-3.5 text-primary" />
            受保护分支通配符 (Protected Branch Patterns)
          </label>
          <div class="flex flex-wrap gap-1.5 p-2 bg-muted/20 border border-border rounded-md">
            <span
              v-for="pattern in defaultBranchTags"
              :key="pattern"
              class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-primary/10 text-primary border border-primary/20"
            >
              {{ pattern }}
            </span>
          </div>
          <p class="text-[11px] text-muted-foreground">
            已默认预置 <code>main</code>, <code>master</code>, <code>release/*</code>, <code>prod/*</code>。在这些分支上禁止 AI 直接提交与篡改。
          </p>
        </div>

        <!-- Fallback toggle -->
        <div class="pt-2 border-t border-border">
          <label class="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              v-model="policy.allow_active_repo_fallback"
              class="rounded text-primary"
            />
            <span class="text-foreground">当外部客户端未指定 <code>repo_path</code> 时，默认回退到 GITBX 当前打开的活动仓库</span>
          </label>
        </div>
      </div>

      <!-- Step 4: Summary & Tools Whitelist -->
      <div v-if="wizardStep === 4" class="border border-border rounded-lg bg-card p-4 space-y-4">
        <div>
          <div class="text-sm font-semibold text-foreground">最终策略汇总与 MCP 工具开关</div>
          <div class="text-xs text-muted-foreground mt-0.5">
            取消选择的 MCP 工具将从 <code>tools/list</code> 彻底剔除。客户端即使本地缓存了工具定义，调用时也会被服务端坚决拒绝。
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 border border-border rounded-md">
          <div
            v-for="tool in serverInfo.available_tools"
            :key="tool.name"
            class="p-2 border border-border rounded bg-muted/10 flex items-start justify-between text-xs gap-2"
          >
            <label class="flex items-start gap-2 cursor-pointer flex-1">
              <input
                type="checkbox"
                :checked="isToolEnabled(tool.name)"
                @change="toggleTool(tool.name)"
                class="rounded text-primary mt-0.5"
              />
              <div>
                <div class="font-mono text-foreground font-medium text-[11px]">{{ tool.name }}</div>
                <div class="text-muted-foreground text-[10px] mt-0.5">{{ tool.description }}</div>
              </div>
            </label>
            <span
              class="text-[9px] px-1 py-0.5 rounded font-medium uppercase shrink-0"
              :class="tool.risk_level === 'read' ? 'bg-blue-500/10 text-blue-500' : tool.risk_level === 'write' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'"
            >
              {{ tool.risk_level }}
            </span>
          </div>
        </div>
      </div>

      <!-- Stepper Controls & Save Button -->
      <div class="flex items-center justify-between pt-2 border-t border-border">
        <div>
          <button
            v-if="wizardStep > 1"
            type="button"
            @click="wizardStep--"
            class="px-3 py-1.5 rounded text-xs bg-muted hover:bg-muted/80 text-foreground transition"
          >
            上一步
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button
            v-if="wizardStep < 4"
            type="button"
            @click="wizardStep++"
            class="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground font-medium transition"
          >
            下一步
          </button>
          <button
            type="button"
            @click="handleSave"
            :disabled="isSaving"
            class="px-3.5 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <Save class="w-3.5 h-3.5" />
            {{ isSaving ? '保存中...' : '保存并实时生效' }}
          </button>
        </div>
      </div>
    </div>

    <!-- SUB-TAB 2: 13 CLIENTS PRESETS -->
    <div v-show="activeSubTab === 'clients'" class="border border-border rounded-lg bg-card p-4 space-y-4">
      <div>
        <div class="text-sm font-semibold text-foreground">13 款主流 MCP 客户端接入配置</div>
        <div class="text-xs text-muted-foreground mt-0.5">
          连接范围与权限均由 GITBX 统一控制并对所有客户端立即生效；生成配置只包含启动 MCP Server 所需的标准运行参数，不包含权限或连接范围变量。
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
        <div
          v-for="c in clients"
          :key="c.id"
          class="border border-border rounded-lg p-3 bg-muted/10 flex flex-col justify-between space-y-2"
        >
          <div class="flex items-center justify-between">
            <span class="font-semibold text-foreground text-xs">{{ c.name }}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
              {{ c.type }}
            </span>
          </div>

          <pre class="bg-card border border-border p-2 rounded text-[10px] font-mono overflow-x-auto text-muted-foreground max-h-20 select-all">{{ getClientConfig(c.id) }}</pre>

          <div class="flex items-center justify-end">
            <button
              type="button"
              @click="copyConfig(c.id)"
              class="px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition"
              :class="copiedClient === c.id ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-primary/10 text-primary hover:bg-primary/20'"
            >
              <Check v-if="copiedClient === c.id" class="w-3 h-3" />
              <Copy v-else class="w-3 h-3" />
              {{ copiedClient === c.id ? '已复制' : '复制配置' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
