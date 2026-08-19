import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { FileDiff } from '@/types/diff';

export const useDiffStore = defineStore('diff', () => {
  const selectedFile = ref<string | null>('crates/gitbx-core/src/lib.rs');
  const activeDiff = ref<FileDiff>({
    old_path: 'crates/gitbx-core/src/lib.rs',
    new_path: 'crates/gitbx-core/src/lib.rs',
    is_binary: false,
    additions: 12,
    deletions: 4,
    hunks: [
      {
        header: '@@ -1,8 +1,16 @@',
        old_start: 1,
        old_lines: 8,
        new_start: 1,
        new_lines: 16,
        lines: [
          { line_type: 'Context', old_lineno: 1, new_lineno: 1, content: 'pub mod auth;' },
          { line_type: 'Context', old_lineno: 2, new_lineno: 2, content: 'pub mod branch;' },
          { line_type: 'Addition', new_lineno: 3, content: '+pub mod graph;' },
          { line_type: 'Addition', new_lineno: 4, content: '+pub mod diff;' },
          { line_type: 'Context', old_lineno: 3, new_lineno: 5, content: 'pub mod repository;' },
          { line_type: 'Deletion', old_lineno: 4, content: '-// legacy single-threaded scanner' },
          { line_type: 'Addition', new_lineno: 6, content: '+pub mod status;' },
          { line_type: 'Addition', new_lineno: 7, content: '+pub use graph::GraphLayoutEngine;' },
        ],
      },
    ],
  });

  const selectFile = (filePath: string) => {
    selectedFile.value = filePath;
  };

  return {
    selectedFile,
    activeDiff,
    selectFile,
  };
});
