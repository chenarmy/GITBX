<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    provider: string;
    size?: number | string;
    className?: string;
  }>(),
  {
    size: 16,
    className: '',
  },
);

const iconSize = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size));
</script>

<template>
  <span
    class="inline-flex items-center justify-center shrink-0 select-none"
    :style="{ width: iconSize, height: iconSize }"
    :class="className"
  >
    <!-- 1. Claude / Anthropic -->
    <svg
      v-if="provider === 'claude' || provider === 'anthropic-compatible'"
      viewBox="0 0 24 24"
      fill="currentColor"
      class="w-full h-full text-[#D97706] dark:text-[#F59E0B]"
    >
      <path d="M4.5 19.5l7.5-15 7.5 15h-3.2l-1.8-3.8H10l-1.8 3.8H4.5zm6.7-6.5h5.6l-2.8-5.8-2.8 5.8z" />
    </svg>

    <!-- 2. OpenAI / OpenAI Compatible -->
    <svg
      v-else-if="provider === 'openai' || provider === 'openai-compatible'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-full h-full text-foreground"
    >
      <path d="M12 2a4 4 0 0 1 4 4v1.5a4 4 0 0 1 2.2 7.2L16.9 16a4 4 0 0 1-5.9 3.5l-1.3-.7a4 4 0 0 1-5.7-4.2V13a4 4 0 0 1-.2-5.7l1.3-.7A4 4 0 0 1 11 3.1V2z" />
      <path d="M9.5 8.5l5 3v5l-5-3z" />
    </svg>

    <!-- 3. Gemini -->
    <svg
      v-else-if="provider === 'gemini'"
      viewBox="0 0 24 24"
      fill="url(#geminiGrad)"
      class="w-full h-full"
    >
      <defs>
        <linearGradient id="geminiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4285F4" />
          <stop offset="50%" stop-color="#9B72CB" />
          <stop offset="100%" stop-color="#D96570" />
        </linearGradient>
      </defs>
      <path d="M12 2C12 7.5 7.5 12 2 12C7.5 12 12 16.5 12 22C12 16.5 16.5 12 22 12C16.5 12 12 7.5 12 2Z" />
    </svg>

    <!-- 4. DeepSeek -->
    <svg
      v-else-if="provider === 'deepseek'"
      viewBox="0 0 24 24"
      fill="currentColor"
      class="w-full h-full text-[#0066FF]"
    >
      <path d="M3 13.5C3 13.5 5 9 11 9C17 9 21 13 21 15C21 16.5 19.5 17.5 17.5 17.5C13.5 17.5 11.5 15.5 8 16C5 16.5 3 13.5 3 13.5ZM17 12C17.55 12 18 11.55 18 11C18 10.45 17.55 10 17 10C16.45 10 16 10.45 16 11C16 11.55 16.45 12 17 12Z" />
      <path d="M11 9C11 6 13 4 15 4C14.5 5.5 14 7 13.5 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>

    <!-- 5. Kimi (Moonshot) -->
    <svg
      v-else-if="provider === 'kimi'"
      viewBox="0 0 24 24"
      fill="none"
      class="w-full h-full"
    >
      <rect width="24" height="24" rx="12" fill="#18181B" />
      <text x="12" y="16.5" font-size="14" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="#FFFFFF">K</text>
    </svg>

    <!-- 6. Qwen (通义千问) -->
    <svg
      v-else-if="provider === 'qwen'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#FF6A00"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-full h-full"
    >
      <path d="M8 6H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
      <path d="M16 6h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3" />
      <line x1="10" y1="12" x2="14" y2="12" stroke="#FF6A00" stroke-width="2.5" />
    </svg>

    <!-- 7. Zhipu (智谱清言 BigModel) -->
    <svg
      v-else-if="provider === 'zhipu'"
      viewBox="0 0 24 24"
      fill="none"
      class="w-full h-full text-[#3451B2] dark:text-[#5B7BF0]"
    >
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <circle cx="12" cy="5" r="2" fill="currentColor" />
      <circle cx="12" cy="19" r="2" fill="currentColor" />
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
      <circle cx="17" cy="17" r="1.5" fill="currentColor" />
      <circle cx="7" cy="17" r="1.5" fill="currentColor" />
      <circle cx="17" cy="7" r="1.5" fill="currentColor" />
    </svg>

    <!-- 8. MiniMax -->
    <svg
      v-else-if="provider === 'minimax'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#FF3366"
      stroke-width="2.2"
      stroke-linecap="round"
      class="w-full h-full"
    >
      <path d="M4 12v2" />
      <path d="M8 9v8" />
      <path d="M12 6v14" />
      <path d="M16 9v8" />
      <path d="M20 12v2" />
    </svg>

    <!-- 9. Ollama -->
    <svg
      v-else-if="provider === 'ollama'"
      viewBox="0 0 24 24"
      fill="currentColor"
      class="w-full h-full text-foreground"
    >
      <path d="M8 4c0-1.1.9-2 2-2h4a2 2 0 0 1 2 2v2h2a2 2 0 0 1 2 2v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a2 2 0 0 1 2-2h2V4zm2 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm4 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
    </svg>

    <!-- 10. Claude Code CLI -->
    <svg
      v-else-if="provider === 'claude-code-cli'"
      viewBox="0 0 24 24"
      fill="currentColor"
      class="w-full h-full text-[#C86432]"
    >
      <path d="M4 8h2v2H4V8zm14 0h2v2h-2V8zM6 10h12v6H6v-6zm-4 4h3v2H2v-2zm17 0h3v2h-3v-2zm-9 3h4v2h-4v-2z" />
    </svg>

    <!-- 11. Codex CLI -->
    <svg
      v-else-if="provider === 'codex-cli'"
      viewBox="0 0 24 24"
      fill="currentColor"
      class="w-full h-full text-[#4361EE]"
    >
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.2l6.8 3.8L12 11.8 5.2 8 12 4.2zM5 9.8l6 3.4v6.6l-6-3.3V9.8zm8 10v-6.6l6-3.4v6.7l-6 3.3z" />
    </svg>

    <!-- 12. OpenCode CLI -->
    <svg
      v-else-if="provider === 'opencode-cli'"
      viewBox="0 0 24 24"
      fill="currentColor"
      class="w-full h-full text-foreground"
    >
      <path d="M5 5h14v3l-8 7h8v4H5v-3l8-7H5V5z" />
    </svg>

    <!-- 13. Cursor CLI -->
    <svg
      v-else-if="provider === 'cursor-cli'"
      viewBox="0 0 24 24"
      fill="currentColor"
      class="w-full h-full text-foreground"
    >
      <path d="M12 2L2 7.5v9L12 22l10-5.5v-9L12 2zm0 2.4l7.6 4.2L12 12.8 4.4 8.6 12 4.4zm-8 5.7l7 3.9v7.4l-7-3.9v-7.4zm9 11.3v-7.4l7-3.9v7.4l-7 3.9z" />
    </svg>

    <!-- 14. CodeBuddy Code -->
    <svg
      v-else-if="provider === 'codebuddy-code'"
      viewBox="0 0 24 24"
      fill="currentColor"
      class="w-full h-full text-[#10B981]"
    >
      <path d="M11 2h2v3h-2V2zM4 9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9zm4 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-7 5h6v1H9v-1z" />
    </svg>

    <!-- 15. Qoder CLI -->
    <svg
      v-else-if="provider === 'qoder-cli'"
      viewBox="0 0 24 24"
      fill="none"
      class="w-full h-full"
    >
      <circle cx="12" cy="12" r="9" stroke="#0EA5E9" stroke-width="2" />
      <text x="12" y="16" font-size="12" font-weight="bold" font-family="sans-serif" text-anchor="middle" fill="#0EA5E9">Q</text>
    </svg>

    <!-- 16. Grok CLI -->
    <svg
      v-else-if="provider === 'grok-cli'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      class="w-full h-full text-foreground"
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="6" y1="18" x2="18" y2="6" stroke-width="2.5" />
    </svg>

    <!-- 17. Pi Coding Agent -->
    <svg
      v-else-if="provider === 'pi-coding-agent'"
      viewBox="0 0 24 24"
      fill="currentColor"
      class="w-full h-full text-foreground"
    >
      <path d="M4 6h16v3h-4v9h-3V9H9v9H6V9H4V6z" />
    </svg>

    <!-- 18. AICodeMirror (Sponsor) -->
    <svg
      v-else-if="provider === 'aicodemirror'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#F97316"
      stroke-width="3"
      stroke-linecap="round"
      class="w-full h-full"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>

    <!-- 19. Jalapeno Cloud (Sponsor) -->
    <svg
      v-else-if="provider === 'jalapeno-cloud'"
      viewBox="0 0 24 24"
      fill="currentColor"
      class="w-full h-full text-[#22C55E]"
    >
      <path d="M14.5 4c0-1.1-.9-2-2-2s-2 .9-2 2c0 .3.1.6.2.8C7.5 6 5 8.8 5 12.2c0 4.3 3.4 7.8 7.5 7.8s7.5-3.5 7.5-7.8c0-3.4-2.5-6.2-5.7-7.4.1-.2.2-.5.2-.8z" />
      <path d="M12 2c1.5 0 2.5.5 3.5 2" stroke="#15803D" stroke-width="1.5" stroke-linecap="round" />
    </svg>

    <!-- 20. HuaLongAI (Sponsor) -->
    <svg
      v-else-if="provider === 'hualongai'"
      viewBox="0 0 24 24"
      fill="none"
      class="w-full h-full"
    >
      <circle cx="12" cy="12" r="9" stroke="#0284C7" stroke-width="2" />
      <path d="M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0z" fill="#38BDF8" />
      <circle cx="14" cy="10" r="1.5" fill="#FFFFFF" />
    </svg>

    <!-- 21. Custom / Default -->
    <svg
      v-else
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-full h-full text-muted-foreground"
    >
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  </span>
</template>
