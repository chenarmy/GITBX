<script setup lang="ts">
import { ref } from 'vue';
import { GitMerge, Sparkles } from 'lucide-vue-next';

const oursContent = ref(`pub fn calculate_layout() -> Vec<Node> {\n    // Parallel multi-core thread pool\n    rayon::spawn(|| {\n        compute_lanes();\n    });\n}`);
const theirsContent = ref(`pub fn calculate_layout() -> Vec<Node> {\n    // Asynchronous tokio task\n    tokio::spawn(async {\n        compute_lanes().await;\n    });\n}`);
const baseContent = ref(`pub fn calculate_layout() -> Vec<Node> {\n    compute_lanes();\n}`);
const resultContent = ref(`pub fn calculate_layout() -> Vec<Node> {\n    // AI suggested: tokio async worker\n    tokio::spawn(async {\n        compute_lanes().await;\n    });\n}`);

function acceptOurs() {
  resultContent.value = oursContent.value;
}

function acceptTheirs() {
  resultContent.value = theirsContent.value;
}

function acceptBoth() {
  resultContent.value = `${oursContent.value}\n\n${theirsContent.value}`;
}
</script>

<template>
  <div class="h-full flex flex-col bg-card border border-border rounded-lg overflow-hidden text-xs">
    <!-- Header -->
    <div class="h-9 bg-muted/60 px-3 flex items-center justify-between border-b border-border select-none">
      <div class="flex items-center space-x-2">
        <GitMerge class="w-4 h-4 text-amber-400" />
        <span class="font-bold text-foreground">3-Way Merge Conflict Resolver</span>
        <span class="text-muted-foreground">(crates/gitbx-graph/src/topology.rs)</span>
      </div>

      <!-- Quick Resolution CTA Buttons -->
      <div class="flex items-center space-x-1.5">
        <button
          @click="acceptOurs"
          class="px-2 py-1 rounded bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 transition"
        >
          Accept Ours (Local)
        </button>
        <button
          @click="acceptTheirs"
          class="px-2 py-1 rounded bg-purple-500/15 hover:bg-purple-500/25 text-purple-400 border border-purple-500/30 transition"
        >
          Accept Theirs (Incoming)
        </button>
        <button
          @click="acceptBoth"
          class="px-2 py-1 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          Accept Both
        </button>
        <button
          class="flex items-center space-x-1 px-2.5 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/40 transition"
        >
          <Sparkles class="w-3.5 h-3.5" />
          <span>AI Resolve</span>
        </button>
      </div>
    </div>

    <!-- 3 Panes: Ours / Base / Theirs -->
    <div class="h-1/2 grid grid-cols-3 divide-x divide-border border-b border-border">
      <!-- Ours -->
      <div class="flex flex-col bg-background/50">
        <div class="h-6 bg-blue-500/10 px-2 flex items-center justify-between text-blue-400 font-semibold border-b border-blue-500/20">
          <span>Ours (HEAD: main)</span>
        </div>
        <textarea
          v-model="oursContent"
          readonly
          class="flex-1 w-full bg-transparent p-2 font-mono text-[11px] text-foreground resize-none focus:outline-none"
        ></textarea>
      </div>

      <!-- Base -->
      <div class="flex flex-col bg-background/30">
        <div class="h-6 bg-muted/60 px-2 flex items-center justify-between text-muted-foreground font-semibold border-b border-border">
          <span>Base (Common Ancestor)</span>
        </div>
        <textarea
          v-model="baseContent"
          readonly
          class="flex-1 w-full bg-transparent p-2 font-mono text-[11px] text-muted-foreground opacity-70 resize-none focus:outline-none"
        ></textarea>
      </div>

      <!-- Theirs -->
      <div class="flex flex-col bg-background/50">
        <div class="h-6 bg-purple-500/10 px-2 flex items-center justify-between text-purple-400 font-semibold border-b border-purple-500/20">
          <span>Theirs (Incoming: feat/graph)</span>
        </div>
        <textarea
          v-model="theirsContent"
          readonly
          class="flex-1 w-full bg-transparent p-2 font-mono text-[11px] text-foreground resize-none focus:outline-none"
        ></textarea>
      </div>
    </div>

    <!-- Result Pane -->
    <div class="h-1/2 flex flex-col bg-background">
      <div class="h-6 bg-emerald-500/10 px-2 flex items-center justify-between text-emerald-400 font-semibold border-b border-emerald-500/20">
        <span>Merged Output (Result)</span>
        <span class="text-[10px] text-muted-foreground">Editable</span>
      </div>
      <textarea
        v-model="resultContent"
        class="flex-1 w-full bg-transparent p-2 font-mono text-[11px] text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
      ></textarea>
    </div>
  </div>
</template>
