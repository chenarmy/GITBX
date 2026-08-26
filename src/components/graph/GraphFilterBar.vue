<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Check, ChevronDown, GitBranch, Search, User, X } from 'lucide-vue-next';
import type { GraphCommitNode, GraphDateRange, GraphFilters } from '@/types/graph';
import { useI18n } from '@/i18n';

const props = defineProps<{
  commits: GraphCommitNode[];
  modelValue: GraphFilters;
  resultCount: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [filters: GraphFilters];
  'search-all': [query: string];
}>();

const { t } = useI18n();
const rootRef = ref<HTMLElement | null>(null);
const activeMenu = ref<'branch' | 'author' | 'date' | 'path' | null>(null);

const branchOptions = computed(() => {
  const names = props.commits.flatMap((commit) => [
    ...(commit.containing_branch_refs ?? []),
    ...commit.branch_refs,
  ]);
  return [...new Set(names)].sort((left, right) => left.localeCompare(right));
});

const authorOptions = computed(() =>
  [...new Set(props.commits.map((commit) => commit.author_name).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right)),
);

const dateOptions: Array<{ value: GraphDateRange; label: string }> = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

const dateLabel = computed(() =>
  dateOptions.find((option) => option.value === props.modelValue.dateRange)?.label ?? 'Date',
);

const hasActiveFilters = computed(() =>
  Boolean(
    props.modelValue.query
    || props.modelValue.branch
    || props.modelValue.author
    || props.modelValue.dateRange !== 'any'
    || props.modelValue.path,
  ),
);

function updateFilters(patch: Partial<GraphFilters>) {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}

function toggleMenu(menu: Exclude<typeof activeMenu.value, null>) {
  activeMenu.value = activeMenu.value === menu ? null : menu;
}

function selectFilter(patch: Partial<GraphFilters>) {
  updateFilters(patch);
  activeMenu.value = null;
}

function clearFilters() {
  emit('update:modelValue', {
    query: '',
    branch: '',
    author: '',
    dateRange: 'any',
    path: '',
  });
  activeMenu.value = null;
}

function handleWindowClick(event: MouseEvent) {
  if (!rootRef.value?.contains(event.target as Node)) activeMenu.value = null;
}

onMounted(() => window.addEventListener('click', handleWindowClick));
onUnmounted(() => window.removeEventListener('click', handleWindowClick));
</script>

<template>
  <div ref="rootRef" class="h-8 border-b border-border bg-card flex items-center px-1.5 gap-1 select-none relative z-20">
    <label class="h-6 min-w-40 max-w-64 flex-1 flex items-center gap-1.5 border border-input bg-background px-2 text-muted-foreground focus-within:border-primary/70">
      <Search class="w-3.5 h-3.5 shrink-0" />
      <input
        :value="modelValue.query"
        class="w-full min-w-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        :placeholder="t('Text or hash')"
        @input="updateFilters({ query: ($event.target as HTMLInputElement).value })"
        @keydown.enter="emit('search-all', modelValue.query.trim())"
      />
      <button
        v-if="modelValue.query"
        class="hover:text-foreground"
        :title="t('Clear')"
        @click="updateFilters({ query: '' })"
      >
        <X class="w-3 h-3" />
      </button>
    </label>

    <div class="relative">
      <button class="graph-filter-button" :class="{ 'is-active': modelValue.branch }" @click.stop="toggleMenu('branch')">
        <GitBranch class="w-3 h-3" />
        <span class="max-w-28 truncate">{{ modelValue.branch || t('Branch') }}</span>
        <ChevronDown class="w-3 h-3" />
      </button>
      <div v-if="activeMenu === 'branch'" class="graph-filter-menu w-56">
        <button class="graph-filter-option" @click="selectFilter({ branch: '' })">
          <Check class="w-3 h-3" :class="modelValue.branch ? 'opacity-0' : ''" />
          <span>{{ t('All branches') }}</span>
        </button>
        <button v-for="branch in branchOptions" :key="branch" class="graph-filter-option" @click="selectFilter({ branch })">
          <Check class="w-3 h-3" :class="modelValue.branch === branch ? '' : 'opacity-0'" />
          <span class="truncate">{{ branch }}</span>
        </button>
      </div>
    </div>

    <div class="relative">
      <button class="graph-filter-button" :class="{ 'is-active': modelValue.author }" @click.stop="toggleMenu('author')">
        <User class="w-3 h-3" />
        <span class="max-w-24 truncate">{{ modelValue.author || t('User') }}</span>
        <ChevronDown class="w-3 h-3" />
      </button>
      <div v-if="activeMenu === 'author'" class="graph-filter-menu w-52">
        <button class="graph-filter-option" @click="selectFilter({ author: '' })">
          <Check class="w-3 h-3" :class="modelValue.author ? 'opacity-0' : ''" />
          <span>{{ t('All users') }}</span>
        </button>
        <button v-for="author in authorOptions" :key="author" class="graph-filter-option" @click="selectFilter({ author })">
          <Check class="w-3 h-3" :class="modelValue.author === author ? '' : 'opacity-0'" />
          <span class="truncate">{{ author }}</span>
        </button>
      </div>
    </div>

    <div class="relative">
      <button class="graph-filter-button" :class="{ 'is-active': modelValue.dateRange !== 'any' }" @click.stop="toggleMenu('date')">
        <span>{{ modelValue.dateRange === 'any' ? t('Date') : t(dateLabel) }}</span>
        <ChevronDown class="w-3 h-3" />
      </button>
      <div v-if="activeMenu === 'date'" class="graph-filter-menu w-40">
        <button v-for="option in dateOptions" :key="option.value" class="graph-filter-option" @click="selectFilter({ dateRange: option.value })">
          <Check class="w-3 h-3" :class="modelValue.dateRange === option.value ? '' : 'opacity-0'" />
          <span>{{ t(option.label) }}</span>
        </button>
      </div>
    </div>

    <div class="relative">
      <button class="graph-filter-button" :class="{ 'is-active': modelValue.path }" @click.stop="toggleMenu('path')">
        <span class="max-w-28 truncate">{{ modelValue.path || t('Paths') }}</span>
        <ChevronDown class="w-3 h-3" />
      </button>
      <div v-if="activeMenu === 'path'" class="graph-filter-menu w-64 p-2">
        <div class="flex items-center gap-1.5 border border-input bg-background px-2 h-7">
          <Search class="w-3 h-3 text-muted-foreground" />
          <input
            :value="modelValue.path"
            class="w-full min-w-0 bg-transparent outline-none"
            :placeholder="t('Path contains')"
            autofocus
            @input="updateFilters({ path: ($event.target as HTMLInputElement).value })"
            @keydown.enter="activeMenu = null"
          />
          <button v-if="modelValue.path" class="text-muted-foreground hover:text-foreground" @click="updateFilters({ path: '' })">
            <X class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <span class="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
      {{ t('{visible} of {total} commits', { visible: resultCount, total: commits.length }) }}
    </span>
    <button
      v-if="hasActiveFilters"
      class="dbx-icon-button dbx-muted-button shrink-0"
      :title="t('Clear filters')"
      @click="clearFilters"
    >
      <X class="w-3.5 h-3.5" />
    </button>
  </div>
</template>

<style scoped>
.graph-filter-button {
  align-items: center;
  border: 1px solid transparent;
  color: hsl(var(--muted-foreground));
  display: inline-flex;
  gap: 0.25rem;
  height: 24px;
  padding: 0 0.4rem;
  white-space: nowrap;
}

.graph-filter-button:hover,
.graph-filter-button.is-active {
  background: hsl(var(--accent));
  border-color: hsl(var(--border));
  color: hsl(var(--foreground));
}

.graph-filter-button.is-active {
  color: hsl(var(--primary));
}

.graph-filter-menu {
  background: hsl(var(--popover));
  border: 1px solid hsl(var(--border));
  color: hsl(var(--popover-foreground));
  left: 0;
  max-height: 240px;
  overflow-y: auto;
  padding: 0.25rem;
  position: absolute;
  top: calc(100% + 4px);
}

.graph-filter-option {
  align-items: center;
  display: flex;
  gap: 0.4rem;
  min-height: 26px;
  padding: 0.25rem 0.4rem;
  text-align: left;
  width: 100%;
}

.graph-filter-option:hover {
  background: hsl(var(--accent));
}
</style>
