import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { FileDiff } from '@/types/diff';

export const useDiffStore = defineStore('diff', () => {
  const selectedFile = ref<string | null>(null);
  const isStaged = ref<boolean>(false);
  const selectedCommitId = ref<string | null>(null);
  const selectedConflictFile = ref<string | null>(null);
  const activeDiff = ref<FileDiff>({
    old_path: undefined,
    new_path: undefined,
    is_binary: false,
    additions: 0,
    deletions: 0,
    hunks: [],
  });

  const selectFile = async (filePath: string, staged: boolean = false, repoPath?: string, commitId?: string) => {
    selectedConflictFile.value = null;
    selectedFile.value = filePath;
    isStaged.value = staged;
    selectedCommitId.value = commitId || null;

    try {
      const params = new URLSearchParams({
        file: filePath,
        staged: String(staged),
      });
      if (repoPath) params.append('path', repoPath);
      if (commitId) params.append('commit', commitId);

      const res = await fetch(`/api/repo/diff?${params.toString()}`);
      const data = await res.json();
      if (data.raw_diff) {
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
    }
  };

  const selectConflictFile = (filePath: string) => {
    selectedConflictFile.value = filePath;
    selectedFile.value = filePath;
    isStaged.value = false;
    selectedCommitId.value = null;
  };

  const clearConflictSelection = () => {
    selectedConflictFile.value = null;
  };

  const clearSelection = () => {
    selectedFile.value = null;
    isStaged.value = false;
    selectedCommitId.value = null;
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
    selectedConflictFile,
    activeDiff,
    selectFile,
    selectConflictFile,
    clearConflictSelection,
    clearSelection,
  };
});
