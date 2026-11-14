<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRepoStore } from '@/stores/repo';
import { useDiffStore } from '@/stores/diff';
import { useNotificationStore } from '@/stores/notification';
import { GitMerge, AlertCircle } from 'lucide-vue-next';
import ArcoModal from '@/components/ui/ArcoModal.vue';
import { useI18n } from '@/i18n';

const repoStore = useRepoStore();
const diffStore = useDiffStore();
const notification = useNotificationStore();
const { t } = useI18n();

const targetBranch = ref('');
const strategy = ref<'default' | 'no-ff' | 'squash' | 'ff-only'>('default');
const customMessage = ref('');
const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);

watch(
  () => repoStore.targetBranchForAction,
  (val) => {
    if (val) targetBranch.value = val;
  }
);

async function handleMerge() {
  if (!targetBranch.value.trim()) return;
  isSubmitting.value = true;
  errorMsg.value = null;
  const previousHead = repoStore.repoInfo?.head_commit_id;
  const sourceBranch = targetBranch.value.trim();
  const currentBranch = repoStore.repoInfo?.head_branch || 'HEAD';
  try {
    const res = await repoStore.mergeBranch(
      sourceBranch,
      strategy.value,
      customMessage.value.trim() || undefined
    );
    if (res.conflict) {
      repoStore.closeModal('merge');
      const firstConflict = repoStore.statusSummary.conflicted_files[0]?.path;
      if (firstConflict) diffStore.selectConflictFile(firstConflict);
    } else if (res.success) {
      repoStore.closeModal('merge');
      if (previousHead === repoStore.repoInfo?.head_commit_id) {
        notification.info(
          t('Already Merged'),
          t("'{source}' is already fully merged into '{target}'.", {
            source: sourceBranch,
            target: currentBranch,
          }),
        );
      } else {
        notification.success(
          t('Merge Completed'),
          t("Merged '{source}' into '{target}'.", {
            source: sourceBranch,
            target: currentBranch,
          }),
        );
      }
    } else {
      errorMsg.value = res.error || 'Failed to merge branch';
    }
  } catch (err: any) {
    errorMsg.value = err?.message || 'Failed to merge branch';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <ArcoModal
    v-if="repoStore.isMergeModalOpen"
    :title="t('Merge into \'{branch}\'', { branch: repoStore.repoInfo?.head_branch || 'main' })"
    icon-bg-class="bg-amber-500/10 text-amber-500"
    body-class="space-y-4"
    @close="repoStore.closeModal('merge')"
  >
    <template #icon>
      <GitMerge class="w-4 h-4" aria-hidden="true" />
    </template>

    <div v-if="errorMsg" class="arco-alert arco-alert-danger">
      <AlertCircle class="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>{{ errorMsg }}</span>
    </div>

    <div>
      <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Source Branch to Merge') }}</label>
      <select v-model="targetBranch" class="arco-select mt-1.5">
        <option
          v-for="b in repoStore.branches.filter(b => b.name !== repoStore.repoInfo?.head_branch)"
          :key="b.name"
          :value="b.name"
        >
          {{ b.name }}
        </option>
      </select>
    </div>

    <div>
      <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Merge Strategy') }}</label>
      <div class="space-y-1.5 mt-1.5">
        <label
          class="flex items-center space-x-2.5 rounded-[6px] border px-3 py-2 cursor-pointer transition-colors"
          :class="strategy === 'default' ? 'border-primary/50 bg-primary/[0.04]' : 'border-border/80 bg-[hsl(var(--arco-fill-1))] hover:bg-accent/55'"
        >
          <input type="radio" v-model="strategy" value="default" class="accent-[hsl(var(--primary))]" />
          <span class="text-foreground">{{ t('Default (Fast-forward if possible, otherwise merge commit)') }}</span>
        </label>
        <label
          class="flex items-center space-x-2.5 rounded-[6px] border px-3 py-2 cursor-pointer transition-colors"
          :class="strategy === 'no-ff' ? 'border-primary/50 bg-primary/[0.04]' : 'border-border/80 bg-[hsl(var(--arco-fill-1))] hover:bg-accent/55'"
        >
          <input type="radio" v-model="strategy" value="no-ff" class="accent-[hsl(var(--primary))]" />
          <span class="text-foreground">{{ t('Always create merge commit (--no-ff)') }}</span>
        </label>
        <label
          class="flex items-center space-x-2.5 rounded-[6px] border px-3 py-2 cursor-pointer transition-colors"
          :class="strategy === 'squash' ? 'border-primary/50 bg-primary/[0.04]' : 'border-border/80 bg-[hsl(var(--arco-fill-1))] hover:bg-accent/55'"
        >
          <input type="radio" v-model="strategy" value="squash" class="accent-[hsl(var(--primary))]" />
          <span class="text-foreground">{{ t('Squash merge (--squash)') }}</span>
        </label>
        <label
          class="flex items-center space-x-2.5 rounded-[6px] border px-3 py-2 cursor-pointer transition-colors"
          :class="strategy === 'ff-only' ? 'border-primary/50 bg-primary/[0.04]' : 'border-border/80 bg-[hsl(var(--arco-fill-1))] hover:bg-accent/55'"
        >
          <input type="radio" v-model="strategy" value="ff-only" class="accent-[hsl(var(--primary))]" />
          <span class="text-foreground">{{ t('Fast-forward only (--ff-only)') }}</span>
        </label>
      </div>
    </div>

    <div v-if="strategy === 'no-ff' || strategy === 'squash'">
      <label class="text-[11px] font-semibold text-muted-foreground">{{ t('Custom Commit Message (Optional)') }}</label>
      <input
        v-model="customMessage"
        type="text"
        placeholder="e.g. merge: pull request #12 from feature/auth"
        class="arco-input mt-1.5"
      />
    </div>

    <template #footer>
      <button
        type="button"
        @click="repoStore.closeModal('merge')"
        class="arco-btn arco-btn-secondary"
      >
        {{ t('Cancel') }}
      </button>
      <button
        type="button"
        @click="handleMerge"
        :disabled="!targetBranch || isSubmitting"
        class="arco-btn arco-btn-primary"
      >
        {{ isSubmitting ? t('Merging...') : t("Merge '{branch}'", { branch: targetBranch }) }}
      </button>
    </template>
  </ArcoModal>
</template>
