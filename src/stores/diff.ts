import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { FileDiff } from '@/types/diff';
import { useGitApi } from '@/composables/useGitApi';

export const useDiffStore = defineStore('diff', () => {
  const gitApi = useGitApi();
  const selectedFile = ref<string | null>(null);
  const isStaged = ref<boolean>(false);
  const selectedCommitId = ref<string | null>(null);
  const branchComparison = ref<{
    baseCommitId: string;
    targetCommitId: string;
  } | null>(null);
  const selectedConflictFile = ref<string | null>(null);
  const activeDiff = ref<FileDiff>({
    old_path: undefined,
    new_path: undefined,
    is_binary: false,
    additions: 0,
    deletions: 0,
    hunks: [],
  });
  const isFileInvestigationOpen = ref(false);
  const isLocalHistoryOpen = ref(false);
  const fileInvestigationTab = ref<'history' | 'blame' | 'compare'>('history');

  const openFileInvestigation = (tab: 'history' | 'blame' | 'compare' = 'history') => {
    if (!selectedFile.value) return;
    fileInvestigationTab.value = tab;
    isFileInvestigationOpen.value = true;
  };

  const selectFile = async (filePath: string, staged: boolean = false, repoPath?: string, commitId?: string) => {
    selectedConflictFile.value = null;
    selectedFile.value = filePath;
    isStaged.value = staged;
    selectedCommitId.value = commitId || null;
    branchComparison.value = null;

    try {
      if (!repoPath) return;
      const data = await gitApi.getFileDiff(repoPath, filePath, staged, commitId);
      if (data.hunks) {
        activeDiff.value = data as FileDiff;
      } else if (data.raw_diff) {
        parseUnifiedDiff(data.raw_diff, filePath);
      } else {
        // Fallback for untracked / new file
        activeDiff.value = {
          old_path: undefined,
          new_path: filePath,
          is_binary: false,
          additions: 1,
          deletions: 0,
          hunks: [
            {
              header: '@@ -0,0 +1,1 @@',
              old_start: 0,
              old_lines: 0,
              new_start: 1,
              new_lines: 1,
              lines: [{ line_type: 'Addition', new_lineno: 1, content: '+[New file content / untracked]' }],
            },
          ],
        };
      }
    } catch (err) {
      console.warn('Failed to fetch diff:', err);
      activeDiff.value = { old_path: filePath, new_path: filePath, is_binary: false, additions: 0, deletions: 0, hunks: [] };
    }
  };

  const selectBranchComparisonFile = async (
    filePath: string,
    oldFilePath: string | undefined,
    repoPath: string,
    baseCommitId: string,
    targetCommitId: string,
  ) => {
    selectedConflictFile.value = null;
    selectedFile.value = filePath;
    isStaged.value = false;
    selectedCommitId.value = null;
    branchComparison.value = { baseCommitId, targetCommitId };

    try {
      activeDiff.value = await gitApi.getFileDiff(repoPath, filePath, false, undefined, {
        baseCommitId,
        targetCommitId,
        oldFilePath,
      }) as FileDiff;
    } catch (err) {
      console.warn('Failed to fetch branch diff:', err);
      activeDiff.value = {
        old_path: oldFilePath || filePath,
        new_path: filePath,
        is_binary: false,
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      throw err;
    }
  };

  const selectConflictFile = (filePath: string) => {
    selectedConflictFile.value = filePath;
    selectedFile.value = filePath;
    isStaged.value = false;
    selectedCommitId.value = null;
    branchComparison.value = null;
  };

  const clearConflictSelection = () => {
    selectedConflictFile.value = null;
  };

  const clearSelection = () => {
    selectedFile.value = null;
    isStaged.value = false;
    selectedCommitId.value = null;
    branchComparison.value = null;
    selectedConflictFile.value = null;
    activeDiff.value = {
      old_path: undefined,
      new_path: undefined,
      is_binary: false,
      additions: 0,
      deletions: 0,
      hunks: [],
    };
  };

  const parseUnifiedDiff = (raw: string, filePath: string) => {
    const lines = raw.split('\n');
    const hunks: any[] = [];
    let currentHunk: any = null;
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        if (currentHunk) hunks.push(currentHunk);
        currentHunk = {
          header: line,
          old_start: 1,
          old_lines: 0,
          new_start: 1,
          new_lines: 0,
          lines: [],
        };
      } else if (currentHunk) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          additions++;
          currentHunk.lines.push({
            line_type: 'Addition',
            new_lineno: currentHunk.lines.length + 1,
            content: line,
          });
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          deletions++;
          currentHunk.lines.push({
            line_type: 'Deletion',
            old_lineno: currentHunk.lines.length + 1,
            content: line,
          });
        } else if (!line.startsWith('diff --git') && !line.startsWith('index ') && !line.startsWith('--- ') && !line.startsWith('+++ ')) {
          currentHunk.lines.push({
            line_type: 'Context',
            old_lineno: currentHunk.lines.length + 1,
            new_lineno: currentHunk.lines.length + 1,
            content: line,
          });
        }
      }
    }
    if (currentHunk) hunks.push(currentHunk);

    activeDiff.value = {
      old_path: filePath,
      new_path: filePath,
      is_binary: false,
      additions,
      deletions,
      hunks,
    };
  };

  return {
    selectedFile,
    isStaged,
    selectedCommitId,
    commitId: selectedCommitId,
    branchComparison,
    selectedConflictFile,
    activeDiff,
    selectFile,
    selectBranchComparisonFile,
    selectConflictFile,
    clearConflictSelection,
    clearSelection,
    isFileInvestigationOpen,
    isLocalHistoryOpen,
    fileInvestigationTab,
    openFileInvestigation,
  };
});
