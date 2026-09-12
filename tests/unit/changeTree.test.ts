import { describe, expect, it } from 'vitest';
import {
  buildChangeTree,
  flattenChangeTreeRows,
  getFileName,
  unifyWorkingFiles,
} from '../../src/utils/changeTree';
import type { FileStatusItem } from '../../src/types/git';

describe('changeTree utils', () => {
  it('correctly extracts file name from various path formats', () => {
    expect(getFileName('src/components/App.vue')).toBe('App.vue');
    expect(getFileName('README.md')).toBe('README.md');
    expect(getFileName('crates\\gitbx-core\\src\\lib.rs')).toBe('lib.rs');
  });

  it('unifies staged and unstaged file items without duplicates', () => {
    const staged: FileStatusItem[] = [
      { path: 'src/main.ts', staged_status: 'Modified', unstaged_status: 'Unmodified', is_staged: true },
    ];
    const unstaged: FileStatusItem[] = [
      { path: 'src/main.ts', staged_status: 'Unmodified', unstaged_status: 'Modified', is_staged: false },
      { path: 'README.md', staged_status: 'Unmodified', unstaged_status: 'Modified', is_staged: false },
    ];
    const untracked: FileStatusItem[] = [];

    const unified = unifyWorkingFiles(staged, unstaged, untracked);
    expect(unified.length).toBe(2);
    expect(unified[0].path).toBe('README.md');
    expect(unified[1].path).toBe('src/main.ts');
    expect(unified[1].is_staged).toBe(true);
    expect(unified[1].staged_status).toBe('Modified');
    expect(unified[1].unstaged_status).toBe('Modified');
  });

  it('builds tree and flattens rows respecting collapsed directories and limit', () => {
    const files: FileStatusItem[] = [
      { path: 'src/components/A.vue', staged_status: 'Modified', unstaged_status: 'Unmodified', is_staged: true },
      { path: 'src/components/B.vue', staged_status: 'Modified', unstaged_status: 'Unmodified', is_staged: true },
      { path: 'src/index.ts', staged_status: 'Modified', unstaged_status: 'Unmodified', is_staged: true },
    ];

    const tree = buildChangeTree(files);
    expect(tree.directories.length).toBe(1);
    expect(tree.directories[0].name).toBe('src');

    const rows = flattenChangeTreeRows(tree, new Set(), 50);
    expect(rows.some((r) => r.type === 'directory' && r.node.name === 'src')).toBe(true);
    expect(rows.some((r) => r.type === 'directory' && r.node.name === 'components')).toBe(true);
    expect(rows.some((r) => r.type === 'file' && r.file.path === 'src/index.ts')).toBe(true);

    const collapsed = new Set(['src/components']);
    const collapsedRows = flattenChangeTreeRows(tree, collapsed, 50);
    expect(collapsedRows.some((r) => r.type === 'file' && r.file.path === 'src/components/A.vue')).toBe(false);
  });
});
