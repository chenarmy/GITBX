<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useDiffStore } from '@/stores/diff';
import type { GraphCommitNode } from '@/types/graph';
import CommitContextMenu from '@/components/menus/CommitContextMenu.vue';
import { Tag } from 'lucide-vue-next';
import { formatDistanceToNow } from 'date-fns';

const repoStore = useRepoStore();
const diffStore = useDiffStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);

const commitContextMenu = ref<{ commit: GraphCommitNode; x: number; y: number } | null>(null);

const LANE_COLORS = [
  '#2563eb', // blue
  '#7c3aed', // purple
  '#059669', // emerald
  '#d97706', // amber
  '#db2777', // pink
  '#0891b2', // cyan
];

const ROW_HEIGHT = 28;
const LANE_WIDTH = 16;
const NODE_RADIUS = 4.5;

function getLaneColor(lane: number) {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

function drawGraph() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const commits = repoStore.commitNodes;
  const height = commits.length * ROW_HEIGHT;
  canvas.height = height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Draw edge lines
  commits.forEach((node, i) => {
    const y = i * ROW_HEIGHT + ROW_HEIGHT / 2;
    const x = node.lane * LANE_WIDTH + 14;

    node.edges.forEach((edge) => {
      const parentIdx = commits.findIndex((c) => c.id === edge.parent_id || c.short_id === edge.parent_id);
      if (parentIdx !== -1) {
        const parentY = parentIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
        const parentX = edge.to_lane * LANE_WIDTH + 14;

        ctx.beginPath();
        ctx.strokeStyle = getLaneColor(edge.from_lane);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        if (edge.edge_type === 'Straight') {
          ctx.moveTo(x, y);
          ctx.lineTo(parentX, parentY);
        } else if (edge.edge_type === 'Fork' || edge.edge_type === 'Merge') {
          ctx.moveTo(x, y);
          const cpY = (y + parentY) / 2;
          ctx.bezierCurveTo(x, cpY, parentX, cpY, parentX, parentY);
        }
        ctx.stroke();
      }
    });
  });

  // 2. Draw commit nodes
  commits.forEach((node, i) => {
    const y = i * ROW_HEIGHT + ROW_HEIGHT / 2;
    const x = node.lane * LANE_WIDTH + 14;
    const isSelected = repoStore.selectedCommit?.id === node.id;

    ctx.beginPath();
    ctx.arc(x, y, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = getLaneColor(node.lane);
    ctx.fill();

    if (isSelected || node.is_head) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
}

function handleSelectCommit(commit: GraphCommitNode) {
  repoStore.selectedCommit = commit;
  diffStore.selectFile('', false, repoStore.activeRepoPath, commit.id);
}

function openCommitContextMenu(e: MouseEvent, commit: GraphCommitNode) {
  e.preventDefault();
  handleSelectCommit(commit);
  commitContextMenu.value = {
    commit,
    x: e.clientX,
    y: e.clientY,
  };
}

onMounted(() => {
  drawGraph();
});

watch(
  () => repoStore.commitNodes,
  () => {
    drawGraph();
  },
  { deep: true }
);

watch(
  () => repoStore.selectedCommit,
  () => {
    drawGraph();
  }
);

function formatTime(timestamp: number) {
  if (!timestamp) return 'recently';
  try {
    return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true });
  } catch {
    return 'recently';
  }
}
</script>

<template>
  <div class="dbx-graph flex-1 flex flex-col bg-card overflow-hidden border-b border-border text-xs">
    <!-- Header row -->
    <div class="dbx-pane-header h-7 bg-muted/40 border-b border-border flex items-center text-muted-foreground font-bold px-2 select-none">
      <div class="w-20 pl-2">Graph</div>
      <div class="flex-1 pl-2">Description</div>
      <div class="w-32">Author</div>
      <div class="w-24">Date</div>
      <div class="w-20 font-mono text-[11px]">Commit</div>
    </div>

    <!-- Scrollable commit list + canvas -->
    <div class="flex-1 overflow-y-auto relative">
      <div v-if="repoStore.commitNodes.length === 0" class="p-8 text-center text-muted-foreground">
        No commits in this repository yet. Make your first commit below!
      </div>

      <div v-else class="relative flex">
        <!-- Canvas overlay for graph lines -->
        <canvas
          ref="canvasRef"
          width="80"
          class="absolute left-0 top-0 pointer-events-none z-10"
        ></canvas>

        <!-- Rows list -->
        <div class="w-full">
          <div
            v-for="commit in repoStore.commitNodes"
            :key="commit.id"
            @click="handleSelectCommit(commit)"
            @contextmenu.prevent="openCommitContextMenu($event, commit)"
            class="h-7 flex items-center px-2 cursor-pointer transition select-none border-b border-border/40 hover:bg-secondary/70"
            :class="repoStore.selectedCommit?.id === commit.id ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'"
          >
            <!-- Graph lane placeholder spacing -->
            <div class="w-20 shrink-0"></div>

            <!-- Description & Branch / Tag Pills -->
            <div class="flex-1 flex items-center space-x-1.5 truncate pr-2">
              <!-- Branch Pills -->
              <span
                v-for="refName in commit.branch_refs"
                :key="refName"
                class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 shrink-0"
              >
                {{ refName }}
              </span>

              <!-- Tag Pills -->
              <span
                v-for="tagName in commit.tag_refs"
                :key="tagName"
                class="inline-flex items-center space-x-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 shrink-0"
              >
                <Tag class="w-2.5 h-2.5" />
                <span>{{ tagName }}</span>
              </span>

              <span class="truncate font-medium">{{ commit.summary }}</span>
            </div>

            <!-- Author -->
            <div class="w-32 truncate text-muted-foreground">{{ commit.author_name }}</div>

            <!-- Date -->
            <div class="w-24 text-muted-foreground opacity-80">{{ formatTime(commit.author_time) }}</div>

            <!-- Short ID -->
            <div class="w-20 font-mono text-[11px] text-muted-foreground opacity-75">{{ commit.short_id }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Commit Context Menu -->
    <CommitContextMenu
      v-if="commitContextMenu"
      :commit="commitContextMenu.commit"
      :x="commitContextMenu.x"
      :y="commitContextMenu.y"
      @close="commitContextMenu = null"
    />
  </div>
</template>
