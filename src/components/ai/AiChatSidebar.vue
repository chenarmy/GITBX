<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import { useAiStore } from '@/stores/ai';
import { useRepoStore } from '@/stores/repo';
import { useNotificationStore } from '@/stores/notification';
import { useI18n } from '@/i18n';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  Sparkles,
  Send,
  Square,
  Bot,
  Plus,
  Trash2,
  X,
  Compass,
  Cpu,
  Play,
  Copy,
  Check,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  AtSign,
  Terminal,
} from 'lucide-vue-next';
import ModelSelectorPopover from './ModelSelectorPopover.vue';
import RepoBranchSelectorModal from './RepoBranchSelectorModal.vue';
import AtMentionPopup from './AtMentionPopup.vue';
import {
  AI_AGENT_TOOLS,
  determineRiskLevel,
  formatCommandPreview,
  executeGitTool,
} from '@/services/aiAgentService';
import { chatWithAi } from '@/api/domain/aiApi';
import type { AiToolCall } from '@/types/ai';

const aiStore = useAiStore();
const repoStore = useRepoStore();
const notification = useNotificationStore();
const { t } = useI18n();

// Popover states
const isModelSelectorOpen = ref(false);
const isContextModalOpen = ref(false);
const isSessionDropdownOpen = ref(false);
const isAtMentionOpen = ref(false);
const atMentionFilter = ref('');

// Input state
const inputPrompt = ref('');
const inputRef = ref<HTMLTextAreaElement | null>(null);
const messagesContainerRef = ref<HTMLElement | null>(null);
const isStreaming = ref(false);
const copiedCodeMap = ref<Record<string, boolean>>({});

// Sidebar width & resizing
const sidebarWidth = ref<number>(
  Number(localStorage.getItem('gitbx_layout_ai_sidebar')) || 430,
);
const isResizing = ref(false);

function startResize(e: PointerEvent) {
  e.preventDefault();
  isResizing.value = true;
  const startX = e.clientX;
  const startWidth = sidebarWidth.value;

  function onPointerMove(moveEvent: PointerEvent) {
    const delta = startX - moveEvent.clientX;
    const newWidth = Math.min(Math.max(startWidth + delta, 340), 800);
    sidebarWidth.value = newWidth;
    localStorage.setItem('gitbx_layout_ai_sidebar', String(newWidth));
  }

  function onPointerUp() {
    isResizing.value = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

// Active context
const targetRepoPath = computed(() => {
  if (aiStore.isPinnedToActive) {
    return repoStore.activeRepoPath || '';
  }
  return aiStore.pinnedRepoPath || repoStore.activeRepoPath || '';
});

const targetBranch = computed(() => {
  if (aiStore.isPinnedToActive) {
    return repoStore.repoInfo?.head_branch || 'HEAD';
  }
  return aiStore.pinnedBranch || repoStore.repoInfo?.head_branch || 'HEAD';
});

const targetRepoName = computed(() => {
  if (aiStore.isPinnedToActive) {
    return repoStore.repoInfo?.name || repoStore.repoList.find((r) => r.path === repoStore.activeRepoPath)?.name || t('No Repo');
  }
  const matched = repoStore.repoList.find((r) => r.path === targetRepoPath.value);
  return matched ? matched.name : t('No Repo');
});

// Current session
const currentSession = computed(() => {
  if (!aiStore.activeSession) {
    aiStore.createSession(t('New Chat'), targetRepoPath.value, targetBranch.value);
  }
  return aiStore.activeSession;
});

// Scroll to bottom
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainerRef.value) {
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight;
    }
  });
}

watch(
  () => currentSession.value?.messages.length,
  () => scrollToBottom(),
);

// Markdown rendering
function renderMarkdown(content: string): string {
  try {
    const rawHtml = marked.parse(content || '', { gfm: true, breaks: true }) as string;
    return DOMPurify.sanitize(rawHtml);
  } catch {
    return content;
  }
}

// Extract shell commands from markdown code blocks
function extractCommands(text: string): string[] {
  const codeBlockRegex = /```(?:bash|sh|shell|zsh)?\n([\s\S]*?)```/g;
  const commands: string[] = [];
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const block = match[1].trim();
    if (block.startsWith('git ') || block.includes('git ')) {
      commands.push(block);
    }
  }
  return commands;
}

// Copy code helper
async function copyToClipboard(text: string, id: string) {
  try {
    await navigator.clipboard.writeText(text);
    copiedCodeMap.value[id] = true;
    setTimeout(() => {
      copiedCodeMap.value[id] = false;
    }, 2000);
  } catch (err) {
    notification.error(t('Copy Failed'), String(err));
  }
}

// Run command in Terminal / gitbx
async function runSuggestedCommand(cmd: string) {
  notification.info(t('Executing Command'), cmd);
  // Log to console drawer
  try {
    const lines = cmd.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    for (const line of lines) {
      const parts = line.trim().replace(/^git\s+/, '').split(/\s+/);
      const action = parts[0];
      if (action === 'checkout' && parts[1]) {
        await executeGitTool(
          {
            id: 'manual_' + Date.now(),
            name: 'run_git_command',
            arguments: { command: 'checkout', branch_name: parts[1] },
            risk_level: 'destructive',
            status: 'running',
          },
          targetRepoPath.value,
        );
      }
    }
    await repoStore.loadRepo();
    notification.success(t('Executed Successfully'), cmd);
  } catch (err: any) {
    notification.error(t('Execution Failed'), err?.message || String(err));
  }
}

// Send Message Flow
async function handleSendMessage() {
  const text = inputPrompt.value.trim();
  if (!text || isStreaming.value) return;

  // Add user message
  aiStore.addMessageToActiveSession({
    role: 'user',
    content: text,
    mode: aiStore.activeMode,
    context_snapshot: {
      repo_path: targetRepoPath.value,
      branch: targetBranch.value,
      staged_count: repoStore.statusSummary.staged_files.length,
      unstaged_count: repoStore.statusSummary.unstaged_files.length,
    },
  });

  inputPrompt.value = '';
  isAtMentionOpen.value = false;
  isStreaming.value = true;
  scrollToBottom();

  try {
    await runChatTurn();
  } catch (err: any) {
    aiStore.addMessageToActiveSession({
      role: 'assistant',
      content: `❌ **${t('AI Generation Error')}**: ${err?.message || String(err)}`,
      mode: aiStore.activeMode,
    });
  } finally {
    isStreaming.value = false;
    scrollToBottom();
  }
}

// Turn loop handling Ask or Agent
async function runChatTurn(depth = 0) {
  if (depth > 6) {
    return;
  }
  const session = currentSession.value;
  if (!session) return;

  const mode = aiStore.activeMode;
  const isAgent = mode === 'agent';

  // Extract detailed repo status context
  const stagedPaths = repoStore.statusSummary.staged_files.map((f) => f.path);
  const unstagedPaths = repoStore.statusSummary.unstaged_files.map((f) => f.path);
  const conflictedPaths = repoStore.statusSummary.conflicted_files.map((f) => f.path);
  const untrackedPaths = repoStore.statusSummary.untracked_files.slice(0, 10).map((f) => f.path);

  // System prompt
  const systemPrompt = isAgent
    ? `You are GITBX AI Agent, an autonomous pair programming assistant specialized in Git version control and developer workflows.
Target Repository: "${targetRepoName.value}" (${targetRepoPath.value})
Current Branch: "${targetBranch.value}"
Workspace Status:
- Staged files (${stagedPaths.length}): ${stagedPaths.join(', ') || 'none'}
- Unstaged files (${unstagedPaths.length}): ${unstagedPaths.join(', ') || 'none'}
- Untracked files (${repoStore.statusSummary.untracked_files.length}): ${untrackedPaths.join(', ') || 'none'}
- Conflicted files (${conflictedPaths.length}): ${conflictedPaths.join(', ') || 'none'}

CRITICAL AGENT RULES:
1. In Agent Mode, you are an action-oriented autonomous agent. When the user asks to analyze changes, inspect repo status, or continue ("继续"), you MUST actively call tools (git_status, git_diff, git_log, git_branch) to obtain real git data.
2. DO NOT output conversational promises like "先查看当前仓库状态" or "让我查看改动情况" without calling the tools. Call git_status or git_diff directly!
3. For read operations, execute them directly via tool calls.
4. For write operations (commit, checkout, push, merge), specify the command through run_git_command so the user can review and approve it.
5. Provide clear, concise, and structured analysis.`
    : `You are GITBX AI Copilot in Ask Mode.
Target Repository: "${targetRepoName.value}" (${targetRepoPath.value})
Current Branch: "${targetBranch.value}"
Workspace Status: ${stagedPaths.length} staged, ${unstagedPaths.length} unstaged.

Guidelines:
1. Provide clear explanations of Git concepts, branch workflows, and error diagnostics.
2. When suggesting Git commands, place them in \`\`\`bash code blocks with explanations.
3. Do not run any commands directly.`;

  // Build messages array conforming to standard OpenAI tool-call format
  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...session.messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.tool_call_id || '',
          content: m.content || '',
        };
      }
      if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        return {
          role: 'assistant',
          content: m.content || '',
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments || {}),
            },
          })),
        };
      }
      return {
        role: m.role,
        content: m.content || '',
      };
    }),
  ];

  const tools = isAgent ? AI_AGENT_TOOLS : undefined;

  const response = await chatWithAi(aiStore.llmConfig, apiMessages, tools);

  // Parse tool calls and text content across both root level and choices paths
  const toolCallsRaw =
    response?.tool_calls ||
    response?.choices?.[0]?.message?.tool_calls ||
    response?.choices?.[0]?.delta?.tool_calls;
  const contentText =
    response?.content ??
    response?.choices?.[0]?.message?.content ??
    '';

  let toolCalls: AiToolCall[] = [];

  if (Array.isArray(toolCallsRaw) && toolCallsRaw.length > 0) {
    toolCalls = toolCallsRaw.map((tc: any) => {
      let args: Record<string, any> = {};
      try {
        args = typeof tc.function?.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function?.arguments || {};
      } catch {
        args = {};
      }
      const risk = determineRiskLevel(tc.function?.name, args);
      return {
        id: tc.id || 'tc_' + Math.random().toString(36).substring(2, 7),
        name: tc.function?.name,
        arguments: args,
        risk_level: risk,
        status: risk === 'safe' ? 'running' : 'pending',
        command: formatCommandPreview(tc.function?.name, args),
      };
    });
  } else if (isAgent) {
    // Fallback in Agent mode:
    // If user asked to analyze code changes, check repository, or says "继续" (continue),
    // but the LLM only returned conversational filler text without calling tools:
    const lastUserMsg = [...session.messages].reverse().find((m) => m.role === 'user');
    const userPrompt = lastUserMsg?.content || '';
    const wantsAnalysis =
      /(?:分析|审查|查看|对比|解释).*?(?:改动|代码|变更|status|diff)|代码改动|继续|continue/i.test(userPrompt) ||
      /先查看|让我查看|正在查看|查看当前/i.test(contentText);

    const hasRecentStatusTool = session.messages.slice(-4).some(
      (m) => (m.role === 'tool' && m.content.includes('total_changes')) ||
             (m.tool_calls && m.tool_calls.some((t) => t.name === 'git_status'))
    );

    if (wantsAnalysis && !hasRecentStatusTool) {
      toolCalls = [
        {
          id: 'tc_auto_' + Date.now().toString(36),
          name: 'git_status',
          arguments: {},
          risk_level: 'safe',
          status: 'running',
          command: 'git status',
        },
      ];
    } else if (wantsAnalysis && hasRecentStatusTool && (unstagedPaths.length > 0 || stagedPaths.length > 0)) {
      const targetFile = unstagedPaths[0] || stagedPaths[0] || '';
      const isStaged = unstagedPaths.length === 0 && stagedPaths.length > 0;
      toolCalls = [
        {
          id: 'tc_auto_diff_' + Date.now().toString(36),
          name: 'git_diff',
          arguments: { file_path: targetFile, staged: isStaged },
          risk_level: 'safe',
          status: 'running',
          command: `git diff ${isStaged ? '--staged ' : ''}${targetFile}`,
        },
      ];
    }
  }

  if (toolCalls.length > 0) {
    // Create assistant message with tool calls
    const assistantMsg = aiStore.addMessageToActiveSession({
      role: 'assistant',
      content: contentText || (toolCalls[0].name === 'git_status' ? t('Checking repository status...') : t('Inspecting file diff...')),
      mode: 'agent',
      tool_calls: toolCalls,
    });

    scrollToBottom();

    // Auto-execute safe tools
    let hasPendingDestructive = false;
    for (const tc of toolCalls) {
      if (tc.risk_level === 'safe') {
        await executeToolCall(assistantMsg.id, tc);
      } else {
        hasPendingDestructive = true;
      }
    }

    // If all tools were safe and executed, continue the turn loop to synthesize the analysis!
    if (!hasPendingDestructive && toolCalls.every((t) => t.status === 'success')) {
      await runChatTurn(depth + 1);
    }
  } else {
    // Normal text reply
    aiStore.addMessageToActiveSession({
      role: 'assistant',
      content: contentText || t('No response content'),
      mode,
    });
  }
}

// Execute individual tool call
async function executeToolCall(_messageId: string, tc: AiToolCall) {
  tc.status = 'running';
  try {
    const result = await executeGitTool(tc, targetRepoPath.value);
    tc.status = 'success';
    tc.result = result;

    // Record tool result message into active session so LLM can read the output!
    aiStore.addMessageToActiveSession({
      role: 'tool',
      content: result,
      tool_call_id: tc.id,
      mode: 'agent',
    });

    // Refresh repo info if git state might have changed
    await repoStore.loadRepo();
  } catch (err: any) {
    tc.status = 'failed';
    tc.error = err?.message || String(err);
    aiStore.addMessageToActiveSession({
      role: 'tool',
      content: `Error executing ${tc.name}: ${err?.message || String(err)}`,
      tool_call_id: tc.id,
      mode: 'agent',
    });
  }
}

// User confirms a destructive tool call
async function handleConfirmTool(_msgId: string, tc: AiToolCall) {
  await executeToolCall(_msgId, tc);
  // Continue turn after confirmation
  isStreaming.value = true;
  try {
    await runChatTurn();
  } catch (err: any) {
    notification.error(t('Agent Error'), String(err));
  } finally {
    isStreaming.value = false;
    scrollToBottom();
  }
}

// User rejects a destructive tool call
async function handleRejectTool(_msgId: string, tc: AiToolCall) {
  tc.status = 'rejected';
  tc.error = t('Operation declined by user.');
  aiStore.addMessageToActiveSession({
    role: 'system',
    content: t('User cancelled command: {cmd}', { cmd: tc.command || tc.name }),
    mode: 'agent',
  });
}

// Insert mention tag
function handleSelectMention(item: any) {
  inputPrompt.value += ` ${item.id} `;
  isAtMentionOpen.value = false;
  inputRef.value?.focus();
}

function handleInputKeydown(e: KeyboardEvent) {
  if (e.key === '@') {
    isAtMentionOpen.value = true;
    atMentionFilter.value = '';
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
}

function handleCreateNewSession() {
  aiStore.createSession(t('New Chat'), targetRepoPath.value, targetBranch.value);
  isSessionDropdownOpen.value = false;
  inputPrompt.value = '';
}

function handleClearMessages() {
  if (currentSession.value) {
    aiStore.clearSessionMessages(currentSession.value.id);
  }
}
</script>

<template>
  <div
    data-testid="ai-chat-sidebar"
    class="relative h-full flex flex-col bg-card border-l border-border shrink-0 select-text z-20"
    :style="{ width: `${sidebarWidth}px` }"
  >
    <!-- Left border resize handle -->
    <div
      class="resize-handle resize-handle-x left-0"
      role="separator"
      aria-orientation="vertical"
      @pointerdown="startResize"
    />

    <!-- 1. Header Bar -->
    <div class="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between shrink-0">
      <div class="flex items-center space-x-2 min-w-0">
        <!-- Session Dropdown -->
        <div class="relative">
          <button
            @click="isSessionDropdownOpen = !isSessionDropdownOpen"
            class="flex items-center space-x-1.5 px-2 py-1 rounded-md hover:bg-secondary text-foreground text-xs font-semibold truncate transition"
          >
            <Sparkles class="w-3.5 h-3.5 text-primary shrink-0" />
            <span class="truncate max-w-[130px]">{{ currentSession?.title || t('AI Copilot') }}</span>
            <ChevronDown class="w-3 h-3 text-muted-foreground shrink-0" />
          </button>

          <!-- Session List Dropdown Menu -->
          <div
            v-if="isSessionDropdownOpen"
            class="absolute left-0 top-full mt-1.5 w-60 bg-popover border border-border rounded-lg shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100"
          >
            <div class="px-2.5 py-1 flex items-center justify-between border-b border-border/50">
              <span class="text-[10px] font-bold text-muted-foreground uppercase">{{ t('Chat Sessions') }}</span>
              <button
                @click="handleCreateNewSession"
                class="flex items-center space-x-1 text-[11px] text-primary hover:underline font-semibold"
              >
                <Plus class="w-3 h-3" />
                <span>{{ t('New') }}</span>
              </button>
            </div>
            <div class="max-h-56 overflow-y-auto py-1 space-y-0.5">
              <div
                v-for="s in aiStore.sessions"
                :key="s.id"
                @click="aiStore.switchSession(s.id); isSessionDropdownOpen = false"
                :class="[
                  'group px-2.5 py-1.5 flex items-center justify-between text-xs cursor-pointer transition',
                  s.id === aiStore.activeSessionId ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-secondary text-foreground/90',
                ]"
              >
                <span class="truncate flex-1 pr-2">{{ s.title }}</span>
                <button
                  @click.stop="aiStore.deleteSession(s.id)"
                  class="p-1 rounded opacity-0 group-hover:opacity-100 hover:text-rose-500 hover:bg-rose-500/10 transition"
                  :title="t('Delete Session')"
                >
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Header Action Controls -->
      <div class="flex items-center space-x-1 shrink-0">
        <button
          @click="handleClearMessages"
          class="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition"
          :title="t('Clear Chat History')"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
        <button
          @click="aiStore.closeSidebar()"
          class="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition"
          :title="t('Close AI Sidebar')"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- 2. Sub-Header: Context & Model Pills + Ask/Agent Switcher -->
    <div class="px-3 py-1.5 border-b border-border bg-muted/10 flex flex-col space-y-1.5 shrink-0">
      <!-- Selector Pills Row -->
      <div class="flex items-center justify-between text-xs space-x-2">
        <!-- Target Context Pill -->
        <button
          @click="isContextModalOpen = true"
          class="flex-1 flex items-center space-x-1.5 px-2 py-1 rounded bg-secondary/70 hover:bg-secondary text-foreground border border-border/60 transition truncate text-left"
          :title="t('Click to switch repository and branch context')"
        >
          <Compass class="w-3 h-3 text-primary shrink-0" />
          <span class="truncate font-mono text-[11px]">{{ targetRepoName }} : {{ targetBranch }}</span>
        </button>

        <!-- Target Model Pill -->
        <button
          @click="isModelSelectorOpen = true"
          class="flex-1 flex items-center space-x-1.5 px-2 py-1 rounded bg-secondary/70 hover:bg-secondary text-foreground border border-border/60 transition truncate text-left"
          :title="t('Click to switch AI provider or model')"
        >
          <Cpu class="w-3 h-3 text-purple-500 shrink-0" />
          <span class="truncate font-mono text-[11px]">{{ aiStore.activeProvider.name }} / {{ aiStore.activeModelId }}</span>
        </button>
      </div>

      <!-- Ask / Agent Mode Segmented Switch -->
      <div class="flex items-center justify-between pt-0.5">
        <div class="flex p-0.5 rounded-lg bg-muted/50 border border-border text-xs w-full">
          <button
            @click="aiStore.setMode('ask')"
            :class="[
              'flex-1 py-1 rounded-md font-semibold text-center transition flex items-center justify-center space-x-1',
              aiStore.activeMode === 'ask'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            ]"
          >
            <span>{{ t('Ask Mode') }}</span>
            <span class="text-[10px] text-muted-foreground/70 font-normal">({{ t('Q&A') }})</span>
          </button>
          <button
            @click="aiStore.setMode('agent')"
            :class="[
              'flex-1 py-1 rounded-md font-semibold text-center transition flex items-center justify-center space-x-1',
              aiStore.activeMode === 'agent'
                ? 'bg-background text-primary shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            ]"
          >
            <Sparkles class="w-3 h-3" />
            <span>{{ t('Agent Mode') }}</span>
            <span class="text-[10px] text-muted-foreground/70 font-normal">({{ t('Autonomous') }})</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 3. Message Stream Timeline -->
    <div
      ref="messagesContainerRef"
      class="flex-1 overflow-y-auto p-3 space-y-4 text-xs font-sans"
    >
      <!-- Empty Chat Welcome & Quick Chips -->
      <div
        v-if="!currentSession?.messages || currentSession.messages.length === 0"
        class="h-full flex flex-col items-center justify-center text-center p-4 text-muted-foreground space-y-3"
      >
        <div class="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
          <Bot class="w-6 h-6" />
        </div>
        <div>
          <h4 class="font-bold text-foreground text-sm">{{ t('GITBX AI Assistant') }}</h4>
          <p class="text-[11px] text-muted-foreground mt-1 max-w-[260px]">
            {{ aiStore.activeMode === 'agent'
              ? t('Agent mode can automatically inspect repository status, check diffs, and plan safe Git operations.')
              : t('Ask mode explains Git mechanics and provides verified commands with one-click copy.')
            }}
          </p>
        </div>

        <!-- Quick prompts chips -->
        <div class="w-full space-y-1.5 pt-2 text-left">
          <div class="text-[10px] font-semibold text-muted-foreground px-1 uppercase tracking-wider">
            {{ t('Quick Suggestions') }}
          </div>
          <button
            @click="inputPrompt = t('Check unstaged changes and explain what was modified'); handleSendMessage()"
            class="w-full p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary text-foreground text-left text-xs transition"
          >
            🔍 {{ t('Check unstaged working tree changes') }}
          </button>
          <button
            @click="inputPrompt = t('Generate a commit message based on staged changes'); handleSendMessage()"
            class="w-full p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary text-foreground text-left text-xs transition"
          >
            📝 {{ t('Suggest commit message for staged files') }}
          </button>
          <button
            @click="inputPrompt = t('Compare current branch with origin and summarize differences'); handleSendMessage()"
            class="w-full p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary text-foreground text-left text-xs transition"
          >
            🌿 {{ t('Inspect branch differences with remote') }}
          </button>
          <button
            @click="inputPrompt = t('Check if there are any merge conflicts in the workspace'); handleSendMessage()"
            class="w-full p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary text-foreground text-left text-xs transition"
          >
            ⚠️ {{ t('Analyze unresolved merge conflicts') }}
          </button>
        </div>
      </div>

      <!-- Messages Loop -->
      <template v-else>
        <div
          v-for="msg in currentSession.messages"
          :key="msg.id"
          class="space-y-2 animate-in fade-in duration-100"
        >
          <!-- User Message -->
          <div v-if="msg.role === 'user'" class="flex justify-end">
            <div class="max-w-[88%] bg-primary text-primary-foreground rounded-2xl rounded-tr-xs px-3.5 py-2 shadow-xs space-y-1">
              <div v-if="msg.context_snapshot" class="text-[10px] opacity-80 font-mono pb-0.5 border-b border-primary-foreground/20">
                @{{ msg.context_snapshot.branch }}
              </div>
              <div class="whitespace-pre-wrap break-words leading-relaxed text-xs">
                {{ msg.content }}
              </div>
            </div>
          </div>

          <!-- Assistant / Tool Messages -->
          <div v-else-if="msg.role === 'assistant'" class="flex flex-col space-y-2">
            <!-- Assistant Avatar & Tag -->
            <div class="flex items-center space-x-1.5 text-muted-foreground text-[10px]">
              <div class="w-4 h-4 rounded bg-primary/20 flex items-center justify-center text-primary">
                <Sparkles class="w-2.5 h-2.5" />
              </div>
              <span class="font-semibold text-foreground">AI Copilot</span>
              <span v-if="msg.mode" class="px-1 py-0.2 rounded bg-muted text-[9px] uppercase font-mono">
                {{ msg.mode }}
              </span>
            </div>

            <!-- Assistant Text Content (Markdown) -->
            <div
              v-if="msg.content"
              class="prose prose-xs dark:prose-invert max-w-none bg-muted/30 border border-border/50 rounded-xl p-3 text-xs leading-relaxed break-words"
              v-html="renderMarkdown(msg.content)"
            />

            <!-- Code block commands execution helper for Ask mode -->
            <div
              v-for="(cmd, cIdx) in extractCommands(msg.content)"
              :key="'cmd_' + cIdx"
              class="border border-border rounded-lg bg-card overflow-hidden shadow-xs"
            >
              <div class="px-2.5 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between text-[11px]">
                <div class="flex items-center space-x-1 text-muted-foreground font-mono">
                  <Terminal class="w-3 h-3 text-emerald-500" />
                  <span>Git Command</span>
                </div>
                <div class="flex items-center space-x-1.5">
                  <button
                    @click="copyToClipboard(cmd, msg.id + '_' + cIdx)"
                    class="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition"
                  >
                    <Check v-if="copiedCodeMap[msg.id + '_' + cIdx]" class="w-3 h-3 text-emerald-500" />
                    <Copy v-else class="w-3 h-3" />
                    <span>{{ copiedCodeMap[msg.id + '_' + cIdx] ? t('Copied') : t('Copy') }}</span>
                  </button>
                  <button
                    @click="runSuggestedCommand(cmd)"
                    class="flex items-center space-x-1 px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary font-semibold transition"
                  >
                    <Play class="w-3 h-3 fill-current" />
                    <span>{{ t('Run') }}</span>
                  </button>
                </div>
              </div>
              <div class="p-2.5 font-mono text-[11px] bg-background/50 overflow-x-auto text-foreground whitespace-pre">
                {{ cmd }}
              </div>
            </div>

            <!-- Tool Calls Execution Cards (Agent mode) -->
            <div v-if="msg.tool_calls && msg.tool_calls.length > 0" class="space-y-2">
              <div
                v-for="tc in msg.tool_calls"
                :key="tc.id"
                class="border border-border rounded-xl bg-card overflow-hidden shadow-xs"
              >
                <!-- Tool Call Card Header -->
                <div class="px-3 py-2 bg-muted/40 border-b border-border flex items-center justify-between text-xs">
                  <div class="flex items-center space-x-2">
                    <span
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold"
                      :class="tc.risk_level === 'safe'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'"
                    >
                      {{ tc.risk_level === 'safe' ? t('Safe Read') : t('Requires Confirmation') }}
                    </span>
                    <span class="font-mono font-semibold text-foreground text-xs">{{ tc.name }}</span>
                  </div>

                  <!-- Status Indicator -->
                  <div class="flex items-center space-x-1.5 text-[11px]">
                    <span v-if="tc.status === 'running'" class="flex items-center space-x-1 text-primary">
                      <Loader2 class="w-3 h-3 animate-spin" />
                      <span>{{ t('Running...') }}</span>
                    </span>
                    <span v-else-if="tc.status === 'success'" class="flex items-center space-x-1 text-emerald-500">
                      <CheckCircle2 class="w-3 h-3" />
                      <span>{{ t('Executed') }}</span>
                    </span>
                    <span v-else-if="tc.status === 'rejected'" class="flex items-center space-x-1 text-muted-foreground">
                      <XCircle class="w-3 h-3" />
                      <span>{{ t('Cancelled') }}</span>
                    </span>
                    <span v-else-if="tc.status === 'failed'" class="flex items-center space-x-1 text-rose-500">
                      <AlertTriangle class="w-3 h-3" />
                      <span>{{ t('Failed') }}</span>
                    </span>
                  </div>
                </div>

                <!-- Command / Arguments Preview -->
                <div class="p-2.5 bg-background font-mono text-[11px] text-foreground border-b border-border/50 overflow-x-auto whitespace-pre">
                  {{ tc.command || JSON.stringify(tc.arguments, null, 2) }}
                </div>

                <!-- Interactive User Approval Buttons for Pending Destructive Tool -->
                <div
                  v-if="tc.status === 'pending'"
                  class="px-3 py-2 bg-amber-500/5 flex items-center justify-between text-xs"
                >
                  <span class="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    ⚠️ {{ t('Confirm execution of this operation?') }}
                  </span>
                  <div class="flex items-center space-x-2">
                    <button
                      @click="handleRejectTool(msg.id, tc)"
                      class="px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 text-foreground transition"
                    >
                      {{ t('Reject') }}
                    </button>
                    <button
                      @click="handleConfirmTool(msg.id, tc)"
                      class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition flex items-center space-x-1"
                    >
                      <Check class="w-3 h-3" />
                      <span>{{ t('Run Command') }}</span>
                    </button>
                  </div>
                </div>

                <!-- Result Box (Collapsible) -->
                <div v-if="tc.result" class="p-2 bg-muted/20 text-[10px] font-mono max-h-36 overflow-y-auto text-muted-foreground whitespace-pre">
                  {{ tc.result }}
                </div>

                <!-- Error Box -->
                <div v-if="tc.error" class="p-2 bg-rose-500/10 text-[11px] text-rose-600 dark:text-rose-400">
                  {{ tc.error }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Streaming Indicator -->
        <div v-if="isStreaming" class="flex items-center space-x-2 text-muted-foreground text-xs py-2">
          <Loader2 class="w-3.5 h-3.5 animate-spin text-primary" />
          <span>{{ aiStore.activeMode === 'agent' ? t('Agent planning and executing operations...') : t('Thinking...') }}</span>
        </div>
      </template>
    </div>

    <!-- 4. Context Mentions Bar -->
    <div class="px-3 py-1 border-t border-border bg-muted/20 flex items-center space-x-1 overflow-x-auto shrink-0">
      <span class="text-[10px] text-muted-foreground font-semibold uppercase mr-1">{{ t('Context:') }}</span>
      <button
        @click="inputPrompt += ' @staged '; inputRef?.focus()"
        class="px-1.5 py-0.5 rounded bg-muted hover:bg-secondary text-[10px] text-muted-foreground hover:text-foreground font-mono transition"
      >
        @staged ({{ repoStore.statusSummary.staged_files.length }})
      </button>
      <button
        @click="inputPrompt += ' @unstaged '; inputRef?.focus()"
        class="px-1.5 py-0.5 rounded bg-muted hover:bg-secondary text-[10px] text-muted-foreground hover:text-foreground font-mono transition"
      >
        @unstaged ({{ repoStore.statusSummary.unstaged_files.length }})
      </button>
      <button
        @click="inputPrompt += ' @conflicts '; inputRef?.focus()"
        class="px-1.5 py-0.5 rounded bg-muted hover:bg-secondary text-[10px] text-muted-foreground hover:text-foreground font-mono transition"
      >
        @conflicts ({{ repoStore.statusSummary.conflicted_files.length }})
      </button>
      <button
        @click="inputPrompt += ' @commits '; inputRef?.focus()"
        class="px-1.5 py-0.5 rounded bg-muted hover:bg-secondary text-[10px] text-muted-foreground hover:text-foreground font-mono transition"
      >
        @commits
      </button>
    </div>

    <!-- 5. Bottom Input Area -->
    <div class="p-3 border-t border-border bg-background relative shrink-0">
      <!-- At Mention Suggestion Popup -->
      <div v-if="isAtMentionOpen" class="absolute bottom-full left-3 mb-2 z-50">
        <AtMentionPopup
          :filter="atMentionFilter"
          @select="handleSelectMention"
          @close="isAtMentionOpen = false"
        />
      </div>

      <div class="relative rounded-xl border border-border bg-muted/30 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition">
        <textarea
          data-testid="ai-chat-input"
          ref="inputRef"
          v-model="inputPrompt"
          rows="3"
          :placeholder="aiStore.activeMode === 'agent'
            ? t('Enter instruction (e.g. checkout new branch, inspect changes, commit)...')
            : t('Ask a Git question or explain changes... (@ to attach context)')"
          class="w-full p-2.5 text-xs bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none leading-relaxed"
          @keydown="handleInputKeydown"
        />

        <div class="px-2.5 py-1.5 flex items-center justify-between border-t border-border/40">
          <div class="flex items-center space-x-1.5">
            <button
              data-testid="at-mention-toggle-btn"
              @click="isAtMentionOpen = !isAtMentionOpen"
              class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition text-xs flex items-center space-x-1"
              :title="t('Insert Context Tag (@)')"
            >
              <AtSign class="w-3.5 h-3.5" />
            </button>
            <span class="text-[10px] text-muted-foreground">
              {{ t('Enter to send, Shift+Enter for newline') }}
            </span>
          </div>

          <div class="flex items-center space-x-2">
            <button
              v-if="isStreaming"
              @click="isStreaming = false"
              class="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition flex items-center space-x-1 text-xs font-semibold"
            >
              <Square class="w-3.5 h-3.5 fill-current" />
              <span>{{ t('Stop') }}</span>
            </button>
            <button
              v-else
              data-testid="ai-chat-send-btn"
              @click="handleSendMessage"
              :disabled="!inputPrompt.trim()"
              class="p-1.5 px-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1 text-xs font-semibold shadow-xs"
            >
              <Send class="w-3.5 h-3.5" />
              <span>{{ t('Send') }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <ModelSelectorPopover
      v-if="isModelSelectorOpen"
      @close="isModelSelectorOpen = false"
    />
    <RepoBranchSelectorModal
      v-if="isContextModalOpen"
      @close="isContextModalOpen = false"
    />
  </div>
</template>
