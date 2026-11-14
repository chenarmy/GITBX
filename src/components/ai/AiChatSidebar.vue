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
  MessageSquare,
  Search,
  FileText,
  GitBranch,
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
    <div class="px-3.5 h-10 border-b border-border bg-card flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2 min-w-0">
        <!-- Session Dropdown -->
        <div class="relative">
          <button
            @click="isSessionDropdownOpen = !isSessionDropdownOpen"
            class="arco-btn arco-btn-text h-7 px-2 text-foreground font-semibold truncate"
          >
            <Sparkles class="w-3.5 h-3.5 text-primary shrink-0" />
            <span class="truncate max-w-[140px]">{{ currentSession?.title || t('AI Copilot') }}</span>
            <ChevronDown class="w-3 h-3 text-muted-foreground shrink-0 transition-transform duration-150" :class="{ 'rotate-180': isSessionDropdownOpen }" />
          </button>

          <!-- Session List Dropdown Menu -->
          <div
            v-if="isSessionDropdownOpen"
            class="arco-menu absolute left-0 top-full mt-1.5 w-64 z-50"
          >
            <div class="px-3 py-1.5 flex items-center justify-between border-b border-border/70 mb-1">
              <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{{ t('Chat Sessions') }}</span>
              <button
                @click="handleCreateNewSession"
                class="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
              >
                <Plus class="w-3 h-3" />
                <span>{{ t('New') }}</span>
              </button>
            </div>
            <div class="max-h-56 overflow-y-auto space-y-0.5">
              <div
                v-for="s in aiStore.sessions"
                :key="s.id"
                @click="aiStore.switchSession(s.id); isSessionDropdownOpen = false"
                :class="[
                  'group mx-1 px-2.5 py-1.5 rounded-[4px] flex items-center justify-between text-xs cursor-pointer transition-colors',
                  s.id === aiStore.activeSessionId ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-accent/70 text-foreground/90',
                ]"
              >
                <span class="truncate flex-1 pr-2">{{ s.title }}</span>
                <button
                  @click.stop="aiStore.deleteSession(s.id)"
                  class="arco-icon-btn arco-icon-btn-sm opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/15"
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
      <div class="flex items-center gap-1 shrink-0">
        <button
          @click="handleClearMessages"
          class="arco-icon-btn arco-icon-btn-sm"
          :title="t('Clear Chat History')"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
        <button
          @click="aiStore.closeSidebar()"
          class="arco-icon-btn arco-icon-btn-sm"
          :title="t('Close AI Sidebar')"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- 2. Sub-Header: Context & Model Pills + Ask/Agent Switcher -->
    <div class="px-3.5 py-2 border-b border-border bg-muted/20 flex flex-col gap-2 shrink-0">
      <!-- Selector Pills Row -->
      <div class="flex items-center justify-between text-xs gap-2">
        <!-- Target Context Pill -->
        <button
          @click="isContextModalOpen = true"
          class="arco-btn arco-btn-secondary arco-btn-sm flex-1 justify-start border border-border/70 hover:border-primary/40 truncate text-left"
          :title="t('Click to switch repository and branch context')"
        >
          <Compass class="w-3 h-3 text-primary shrink-0" />
          <span class="truncate font-mono text-[11px]">{{ targetRepoName }} : {{ targetBranch }}</span>
        </button>

        <!-- Target Model Pill -->
        <button
          data-testid="ai-model-selector-pill"
          @click="isModelSelectorOpen = true"
          class="arco-btn arco-btn-secondary arco-btn-sm flex-1 justify-start border border-border/70 hover:border-primary/40 truncate text-left"
          :title="t('Click to switch AI provider or model')"
        >
          <Cpu class="w-3 h-3 text-purple-500 shrink-0" />
          <span class="truncate font-mono text-[11px]">{{ aiStore.activeProvider.name }} / {{ aiStore.activeModelId }}</span>
        </button>
      </div>

      <!-- Ask / Agent Mode Segmented Switch -->
      <div class="arco-segmented w-full">
        <button
          data-testid="ai-mode-ask-btn"
          @click="aiStore.setMode('ask')"
          :class="[
            'arco-segmented-item flex-1 py-1',
            { 'arco-segmented-item-active text-primary': aiStore.activeMode === 'ask' },
          ]"
        >
          <MessageSquare class="w-3 h-3" />
          <span>{{ t('Ask Mode') }}</span>
          <span class="text-[10px] text-muted-foreground/75 font-normal">({{ t('Q&A') }})</span>
        </button>
        <button
          data-testid="ai-mode-agent-btn"
          @click="aiStore.setMode('agent')"
          :class="[
            'arco-segmented-item flex-1 py-1',
            { 'arco-segmented-item-active text-primary': aiStore.activeMode === 'agent' },
          ]"
        >
          <Sparkles class="w-3 h-3" />
          <span>{{ t('Agent Mode') }}</span>
          <span class="text-[10px] text-muted-foreground/75 font-normal">({{ t('Autonomous') }})</span>
        </button>
      </div>
    </div>

    <!-- 3. Message Stream Timeline -->
    <div
      ref="messagesContainerRef"
      class="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs font-sans"
    >
      <!-- Empty Chat Welcome & Quick Chips -->
      <div
        v-if="!currentSession?.messages || currentSession.messages.length === 0"
        class="h-full flex flex-col items-center justify-center text-center p-4 text-muted-foreground space-y-3.5"
      >
        <div class="w-12 h-12 rounded-[12px] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
          <Bot class="w-6 h-6" />
        </div>
        <div>
          <h4 class="font-semibold text-foreground text-sm">{{ t('GITBX AI Assistant') }}</h4>
          <p class="text-[11px] text-muted-foreground mt-1 max-w-[260px] leading-relaxed">
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
            class="w-full p-2.5 rounded-[6px] border border-border/80 bg-background/60 hover:bg-accent/70 hover:border-primary/40 text-foreground text-left text-xs transition-colors flex items-center gap-2"
          >
            <Search class="w-3.5 h-3.5 text-primary shrink-0" />
            <span>{{ t('Check unstaged working tree changes') }}</span>
          </button>
          <button
            @click="inputPrompt = t('Generate a commit message based on staged changes'); handleSendMessage()"
            class="w-full p-2.5 rounded-[6px] border border-border/80 bg-background/60 hover:bg-accent/70 hover:border-primary/40 text-foreground text-left text-xs transition-colors flex items-center gap-2"
          >
            <FileText class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>{{ t('Suggest commit message for staged files') }}</span>
          </button>
          <button
            @click="inputPrompt = t('Compare current branch with origin and summarize differences'); handleSendMessage()"
            class="w-full p-2.5 rounded-[6px] border border-border/80 bg-background/60 hover:bg-accent/70 hover:border-primary/40 text-foreground text-left text-xs transition-colors flex items-center gap-2"
          >
            <GitBranch class="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <span>{{ t('Inspect branch differences with remote') }}</span>
          </button>
          <button
            @click="inputPrompt = t('Check if there are any merge conflicts in the workspace'); handleSendMessage()"
            class="w-full p-2.5 rounded-[6px] border border-border/80 bg-background/60 hover:bg-accent/70 hover:border-primary/40 text-foreground text-left text-xs transition-colors flex items-center gap-2"
          >
            <AlertTriangle class="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>{{ t('Analyze unresolved merge conflicts') }}</span>
          </button>
        </div>
      </div>

      <!-- Messages Loop -->
      <template v-else>
        <div
          v-for="msg in currentSession.messages"
          :key="msg.id"
          class="space-y-2.5"
        >
          <!-- User Message -->
          <div v-if="msg.role === 'user'" class="flex justify-end">
            <div class="max-w-[88%] bg-primary text-primary-foreground rounded-[12px] rounded-tr-[4px] px-3.5 py-2.5 shadow-sm space-y-1">
              <div v-if="msg.context_snapshot" class="text-[10px] opacity-85 font-mono pb-1 border-b border-primary-foreground/20">
                @{{ msg.context_snapshot.branch }}
              </div>
              <div class="whitespace-pre-wrap break-words leading-relaxed text-xs">
                {{ msg.content }}
              </div>
            </div>
          </div>

          <!-- Assistant / Tool Messages -->
          <div v-else-if="msg.role === 'assistant'" class="flex flex-col gap-2">
            <!-- Assistant Avatar & Tag -->
            <div class="flex items-center gap-1.5 text-muted-foreground text-[10px]">
              <div class="w-5 h-5 rounded-[5px] bg-primary/15 text-primary flex items-center justify-center">
                <Sparkles class="w-3 h-3" />
              </div>
              <span class="font-semibold text-foreground">AI Copilot</span>
              <span v-if="msg.mode" class="arco-tag bg-secondary text-muted-foreground border-border uppercase font-mono">
                {{ msg.mode }}
              </span>
            </div>

            <!-- Assistant Text Content (Markdown) -->
            <div
              v-if="msg.content"
              class="prose prose-xs dark:prose-invert max-w-none bg-muted/35 border border-border/70 rounded-[8px] p-3.5 text-xs leading-relaxed break-words"
              v-html="renderMarkdown(msg.content)"
            />

            <!-- Code block commands execution helper for Ask mode -->
            <div
              v-for="(cmd, cIdx) in extractCommands(msg.content)"
              :key="'cmd_' + cIdx"
              class="arco-card rounded-[8px] overflow-hidden"
            >
              <div class="px-3 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between text-[11px]">
                <div class="flex items-center gap-1.5 text-muted-foreground font-mono">
                  <Terminal class="w-3 h-3 text-emerald-500" />
                  <span>Git Command</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <button
                    @click="copyToClipboard(cmd, msg.id + '_' + cIdx)"
                    class="arco-btn arco-btn-text arco-btn-sm h-6 px-2"
                  >
                    <Check v-if="copiedCodeMap[msg.id + '_' + cIdx]" class="w-3 h-3 text-emerald-500" />
                    <Copy v-else class="w-3 h-3" />
                    <span>{{ copiedCodeMap[msg.id + '_' + cIdx] ? t('Copied') : t('Copy') }}</span>
                  </button>
                  <button
                    @click="runSuggestedCommand(cmd)"
                    class="arco-btn arco-btn-sm bg-primary/10 hover:bg-primary/15 text-primary border border-primary/25 h-6 px-2"
                  >
                    <Play class="w-3 h-3 fill-current" />
                    <span>{{ t('Run') }}</span>
                  </button>
                </div>
              </div>
              <div class="p-2.5 font-mono text-[11px] bg-background/60 overflow-x-auto text-foreground whitespace-pre">
                {{ cmd }}
              </div>
            </div>

            <!-- Tool Calls Execution Cards (Agent mode) -->
            <div v-if="msg.tool_calls && msg.tool_calls.length > 0" class="space-y-2">
              <div
                v-for="tc in msg.tool_calls"
                :key="tc.id"
                class="arco-card rounded-[8px] overflow-hidden"
              >
                <!-- Tool Call Card Header -->
                <div class="px-3 py-2 bg-muted/40 border-b border-border flex items-center justify-between text-xs">
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      class="arco-tag font-semibold shrink-0"
                      :class="tc.risk_level === 'safe'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'"
                    >
                      {{ tc.risk_level === 'safe' ? t('Safe Read') : t('Requires Confirmation') }}
                    </span>
                    <span class="font-mono font-semibold text-foreground text-xs truncate">{{ tc.name }}</span>
                  </div>

                  <!-- Status Indicator -->
                  <div class="flex items-center gap-1.5 text-[11px] shrink-0">
                    <span v-if="tc.status === 'running'" class="flex items-center gap-1 text-primary">
                      <Loader2 class="w-3 h-3 animate-spin" />
                      <span>{{ t('Running...') }}</span>
                    </span>
                    <span v-else-if="tc.status === 'success'" class="flex items-center gap-1 text-emerald-500">
                      <CheckCircle2 class="w-3 h-3" />
                      <span>{{ t('Executed') }}</span>
                    </span>
                    <span v-else-if="tc.status === 'rejected'" class="flex items-center gap-1 text-muted-foreground">
                      <XCircle class="w-3 h-3" />
                      <span>{{ t('Cancelled') }}</span>
                    </span>
                    <span v-else-if="tc.status === 'failed'" class="flex items-center gap-1 text-destructive">
                      <AlertTriangle class="w-3 h-3" />
                      <span>{{ t('Failed') }}</span>
                    </span>
                  </div>
                </div>

                <!-- Command / Arguments Preview -->
                <div class="p-2.5 bg-background/60 font-mono text-[11px] text-foreground border-b border-border/50 overflow-x-auto whitespace-pre">
                  {{ tc.command || JSON.stringify(tc.arguments, null, 2) }}
                </div>

                <!-- Interactive User Approval Buttons for Pending Destructive Tool -->
                <div
                  v-if="tc.status === 'pending'"
                  class="px-3 py-2 bg-amber-500/[0.06] flex items-center justify-between gap-2 text-xs"
                >
                  <span class="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    <AlertTriangle class="w-3.5 h-3.5 shrink-0" />
                    <span>{{ t('Confirm execution of this operation?') }}</span>
                  </span>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <button
                      @click="handleRejectTool(msg.id, tc)"
                      class="arco-btn arco-btn-secondary arco-btn-sm"
                    >
                      {{ t('Reject') }}
                    </button>
                    <button
                      @click="handleConfirmTool(msg.id, tc)"
                      class="arco-btn arco-btn-success arco-btn-sm"
                    >
                      <Check class="w-3 h-3" />
                      <span>{{ t('Run Command') }}</span>
                    </button>
                  </div>
                </div>

                <!-- Result Box -->
                <div v-if="tc.result" class="p-2.5 bg-muted/25 text-[10px] font-mono max-h-36 overflow-y-auto text-muted-foreground whitespace-pre">
                  {{ tc.result }}
                </div>

                <!-- Error Box -->
                <div v-if="tc.error" class="p-2.5 bg-destructive/10 text-[11px] text-destructive">
                  {{ tc.error }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Streaming Indicator -->
        <div v-if="isStreaming" class="flex items-center gap-2 text-muted-foreground text-xs py-2">
          <Loader2 class="w-3.5 h-3.5 animate-spin text-primary" />
          <span>{{ aiStore.activeMode === 'agent' ? t('Agent planning and executing operations...') : t('Thinking...') }}</span>
        </div>
      </template>
    </div>

    <!-- 4. Context Mentions Bar -->
    <div class="px-3.5 py-1.5 border-t border-border bg-muted/20 flex items-center gap-1.5 overflow-x-auto shrink-0">
      <span class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mr-0.5 shrink-0">{{ t('Context:') }}</span>
      <button
        @click="inputPrompt += ' @staged '; inputRef?.focus()"
        class="arco-tag bg-secondary hover:bg-primary/10 hover:text-primary hover:border-primary/35 border-border/70 text-muted-foreground font-mono transition-colors cursor-pointer"
      >
        @staged ({{ repoStore.statusSummary.staged_files.length }})
      </button>
      <button
        @click="inputPrompt += ' @unstaged '; inputRef?.focus()"
        class="arco-tag bg-secondary hover:bg-primary/10 hover:text-primary hover:border-primary/35 border-border/70 text-muted-foreground font-mono transition-colors cursor-pointer"
      >
        @unstaged ({{ repoStore.statusSummary.unstaged_files.length }})
      </button>
      <button
        @click="inputPrompt += ' @conflicts '; inputRef?.focus()"
        class="arco-tag bg-secondary hover:bg-primary/10 hover:text-primary hover:border-primary/35 border-border/70 text-muted-foreground font-mono transition-colors cursor-pointer"
      >
        @conflicts ({{ repoStore.statusSummary.conflicted_files.length }})
      </button>
      <button
        @click="inputPrompt += ' @commits '; inputRef?.focus()"
        class="arco-tag bg-secondary hover:bg-primary/10 hover:text-primary hover:border-primary/35 border-border/70 text-muted-foreground font-mono transition-colors cursor-pointer"
      >
        @commits
      </button>
    </div>

    <!-- 5. Bottom Input Area -->
    <div class="p-3 border-t border-border bg-card relative shrink-0">
      <!-- At Mention Suggestion Popup -->
      <div v-if="isAtMentionOpen" class="absolute bottom-full left-3 mb-2 z-50">
        <AtMentionPopup
          :filter="atMentionFilter"
          @select="handleSelectMention"
          @close="isAtMentionOpen = false"
        />
      </div>

      <div class="relative rounded-[8px] border border-input bg-background/80 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
        <textarea
          data-testid="ai-chat-input"
          ref="inputRef"
          v-model="inputPrompt"
          rows="3"
          :placeholder="aiStore.activeMode === 'agent'
            ? t('Enter instruction (e.g. checkout new branch, inspect changes, commit)...')
            : t('Ask a Git question or explain changes... (@ to attach context)')"
          class="w-full p-2.5 text-xs bg-transparent text-foreground placeholder:text-muted-foreground/65 focus:outline-none resize-none leading-relaxed"
          @keydown="handleInputKeydown"
        />

        <div class="px-2.5 py-1.5 flex items-center justify-between border-t border-border/60">
          <div class="flex items-center gap-1.5">
            <button
              data-testid="at-mention-toggle-btn"
              @click="isAtMentionOpen = !isAtMentionOpen"
              class="arco-icon-btn arco-icon-btn-sm"
              :title="t('Insert Context Tag (@)')"
            >
              <AtSign class="w-3.5 h-3.5" />
            </button>
            <span class="text-[10px] text-muted-foreground">
              {{ t('Enter to send, Shift+Enter for newline') }}
            </span>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              v-if="isStreaming"
              @click="isStreaming = false"
              class="arco-btn arco-btn-sm arco-btn-danger-outline"
            >
              <Square class="w-3 h-3 fill-current" />
              <span>{{ t('Stop') }}</span>
            </button>
            <button
              v-else
              data-testid="ai-chat-send-btn"
              @click="handleSendMessage"
              :disabled="!inputPrompt.trim()"
              class="arco-btn arco-btn-primary arco-btn-sm px-3"
            >
              <Send class="w-3 h-3" />
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
