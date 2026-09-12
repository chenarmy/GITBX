import type { FileStatusItem } from '@/types/git';

export interface ChangeTreeNode {
  name: string;
  path: string;
  directories: ChangeTreeNode[];
  files: FileStatusItem[];
  descendantFiles: FileStatusItem[];
}

export type ChangeTreeRow =
  | { type: 'directory'; depth: number; node: ChangeTreeNode }
  | { type: 'file'; depth: number; file: FileStatusItem };

export function getFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function unifyWorkingFiles(
  staged: FileStatusItem[],
  unstaged: FileStatusItem[],
  untracked: FileStatusItem[]
): FileStatusItem[] {
  const files = new Map<string, FileStatusItem>();
  for (const file of [...staged, ...unstaged, ...untracked]) {
    const existing = files.get(file.path);
    if (!existing) {
      files.set(file.path, { ...file });
      continue;
    }
    files.set(file.path, {
      ...existing,
      ...file,
      staged_status:
        file.staged_status !== 'Unmodified' ? file.staged_status : existing.staged_status,
      unstaged_status:
        file.unstaged_status !== 'Unmodified' ? file.unstaged_status : existing.unstaged_status,
      is_staged: existing.is_staged || file.is_staged,
    });
  }
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function buildChangeTree(files: FileStatusItem[]): ChangeTreeNode {
  type MutableTreeNode = Omit<ChangeTreeNode, 'directories'> & {
    directoryMap: Map<string, MutableTreeNode>;
  };
  const root: MutableTreeNode = {
    name: '',
    path: '',
    directoryMap: new Map(),
    files: [],
    descendantFiles: [],
  };

  for (const file of files) {
    const parts = file.path.replace(/\\/g, '/').split('/').filter(Boolean);
    let current = root;
    current.descendantFiles.push(file);
    for (const part of parts.slice(0, -1)) {
      const path = current.path ? `${current.path}/${part}` : part;
      let child = current.directoryMap.get(part);
      if (!child) {
        child = { name: part, path, directoryMap: new Map(), files: [], descendantFiles: [] };
        current.directoryMap.set(part, child);
      }
      child.descendantFiles.push(file);
      current = child;
    }
    current.files.push(file);
  }

  const finalize = (node: MutableTreeNode): ChangeTreeNode => ({
    name: node.name,
    path: node.path,
    directories: [...node.directoryMap.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(finalize),
    files: [...node.files].sort((a, b) =>
      getFileName(a.path).localeCompare(getFileName(b.path))
    ),
    descendantFiles: node.descendantFiles,
  });

  return finalize(root);
}

export function flattenChangeTreeRows(
  tree: ChangeTreeNode,
  collapsed: Set<string>,
  limit: number
): ChangeTreeRow[] {
  const rows: ChangeTreeRow[] = [];
  let renderedFiles = 0;

  const visit = (node: ChangeTreeNode, depth: number) => {
    for (const directory of node.directories) {
      if (renderedFiles >= limit) return;
      rows.push({ type: 'directory', depth, node: directory });
      if (!collapsed.has(directory.path)) visit(directory, depth + 1);
    }
    for (const file of node.files) {
      if (renderedFiles >= limit) return;
      rows.push({ type: 'file', depth, file });
      renderedFiles += 1;
    }
  };

  visit(tree, 0);
  return rows;
}
