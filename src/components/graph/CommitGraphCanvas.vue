<script setup lang="ts">
import { computed, ref, nextTick, onMounted, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useNotificationStore } from '@/stores/notification';
import type { GraphCommitNode, GraphFilters } from '@/types/graph';
import CommitContextMenu from '@/components/menus/CommitContextMenu.vue';
import GraphFilterBar from '@/components/graph/GraphFilterBar.vue';
import { Tag } from 'lucide-vue-next';
import { formatDistanceToNow } from 'date-fns';
import { arSA, de, enUS, es, fr, ja, zhCN, zhTW } from 'date-fns/locale';
import type { Locale as DateFnsLocale } from 'date-fns';
import type { Locale as AppLocale } from '@/i18n/config';
import { useI18n } from '@/i18n';

const repoStore = useRepoStore();
const notification = useNotificationStore();
const { locale, t } = useI18n();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const filters = ref<GraphFilters>({
  query: '',
  branch: '',
  author: '',
  dateRange: 'any',
  path: '',
});

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

const graphWidth = computed(() => {
  const maximumLane = visibleCommits.value.reduce((maximum, node) => Math.max(
    maximum,
    node.lane,
    ...node.edges.map((edge) => Math.max(edge.from_lane, edge.to_lane)),
  ), 0);
  return Math.max(80, maximumLane * LANE_WIDTH + 30);
});

const DATE_LOCALES: Record<AppLocale, DateFnsLocale> = {
  en: enUS,
  ja,
  de,
  es,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  fr,
  ar: arSA,
};

const visibleCommits = computed(() => {
  const query = filters.value.query.trim().toLocaleLowerCase();
  const pathQuery = filters.value.path.trim().replace(/\\/g, '/').toLocaleLowerCase();
  const now = Date.now();
  let minimumTime = 0;

  if (filters.value.dateRange === 'today') {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    minimumTime = startOfToday.getTime();
  } else if (filters.value.dateRange !== 'any') {
    const days = Number.parseInt(filters.value.dateRange, 10);
    minimumTime = now - days * 24 * 60 * 60 * 1000;
  }

  return repoStore.commitNodes.filter((commit) => {
    const searchableText = [
      commit.summary,
      commit.id,
      commit.short_id,
      commit.author_name,
      ...commit.branch_refs,
      ...commit.tag_refs,
    ].join(' ').toLocaleLowerCase();
    const branchRefs = commit.containing_branch_refs ?? commit.branch_refs;
    const changedPaths = commit.changed_paths ?? [];

    return (!query || searchableText.includes(query))
      && (!filters.value.branch || branchRefs.includes(filters.value.branch))
      && (!filters.value.author || commit.author_name === filters.value.author)
      && (!minimumTime || commit.author_time * 1000 >= minimumTime)
      && (!pathQuery || changedPaths.some((path) => path.replace(/\\/g, '/').toLocaleLowerCase().includes(pathQuery)));
  });
});

function getLaneColor(lane: number) {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

function drawGraph() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const commits = visibleCommits.value;
  const height = commits.length * ROW_HEIGHT;
  canvas.width = graphWidth.value;
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
        if (edge.from_lane === edge.to_lane) {
          ctx.strokeStyle = getLaneColor(edge.from_lane);
        } else {
          const gradient = ctx.createLinearGradient(x, y, parentX, parentY);
          gradient.addColorStop(0, getLaneColor(edge.from_lane));
          gradient.addColorStop(1, getLaneColor(edge.to_lane));
          ctx.strokeStyle = gradient;
        }
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
  repoStore.selectCommit(commit);
}

async function handleSearchAll(query: string) {
  if (!/^[0-9a-f]{4,40}$/i.test(query)) return;
  try {
    const found = await repoStore.locateRevision(query);
    if (!found) notification.warning(t('Commit not found'), query);
  } catch {
    notification.warning(t('Commit not found'), query);
  }
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
  visibleCommits,
  async () => {
    await nextTick();
    drawGraph();
  },
  { deep: true, flush: 'post' }
);

watch(
  () => repoStore.selectedCommit,
  async () => {
    await nextTick();
    drawGraph();
    const selectedId = repoStore.selectedCommit?.id;
    if (selectedId) document.getElementById(`commit-${selectedId}`)?.scrollIntoView({ block: 'nearest' });
  },
  { flush: 'post' }
);

function formatTime(timestamp: number) {
  if (!timestamp) return t('recently');
  try {
    return formatDistanceToNow(new Date(timestamp * 1000), {
      addSuffix: true,
      locale: DATE_LOCALES[locale.value],
    });
  } catch {
    return t('recently');
  }
}
</script>

<template>
  <div class="dbx-graph flex-1 flex flex-col bg-card overflow-hidden border-b border-border text-xs">
    <GraphFilterBar
      v-model="filters"
      :commits="repoStore.commitNodes"
      :result-count="visibleCommits.length"
      @search-all="handleSearchAll"
    />

    <!-- Header row -->
    <div class="dbx-pane-header h-7 bg-muted/40 border-b border-border flex items-center text-muted-foreground font-bold px-2 select-none">
      <div class="shrink-0 pl-2" :style="{ width: `${graphWidth}px` }">{{ t('Graph') }}</div>
      <div class="flex-1 pl-2">{{ t('Description') }}</div>
      <div class="w-32">{{ t('Author') }}</div>
      <div class="w-24">{{ t('Date') }}</div>
      <div class="w-20 font-mono text-[11px]">{{ t('Commit') }}</div>
    </div>

    <!-- Scrollable commit list + canvas -->
    <div class="flex-1 overflow-y-auto relative">
      <div v-if="repoStore.commitNodes.length === 0" class="p-8 text-center text-muted-foreground">
        {{ t('No commits in this repository yet. Make your first commit below!') }}
      </div>

      <div v-else-if="visibleCommits.length === 0" class="p-8 text-center text-muted-foreground">
        {{ t('No commits match the current filters.') }}
      </div>

      <div v-else class="relative flex">
        <!-- Canvas overlay for graph lines -->
        <canvas
          ref="canvasRef"
          :width="graphWidth"
          class="absolute left-0 top-0 pointer-events-none z-10"
        ></canvas>

        <!-- Rows list -->
        <div class="w-full">
          <div
            v-for="commit in visibleCommits"
            :key="commit.id"
            :id="`commit-${commit.id}`"
            @click="handleSelectCommit(commit)"
            @contextmenu.prevent="openCommitContextMenu($event, commit)"
            class="h-7 flex items-center px-2 cursor-pointer transition select-none border-b border-border/40 hover:bg-secondary/70"
            :class="repoStore.selectedCommit?.id === commit.id ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'"
          >
            <!-- Graph lane placeholder spacing -->
            <div class="shrink-0" :style="{ width: `${graphWidth}px` }"></div>

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
          <div v-if="repoStore.graphHasMore" class="flex justify-center p-2 border-b border-border/40">
            <button
              class="px-3 py-1 rounded border border-border bg-secondary hover:bg-muted disabled:opacity-50"
              :disabled="repoStore.isLoadingMoreCommits"
              @click="repoStore.loadMoreCommits()"
            >
              {{ t(repoStore.isLoadingMoreCommits ? 'Loading commits...' : 'Load more commits') }}
            </button>
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
