export type DiffLineType = 'Context' | 'Addition' | 'Deletion' | 'HunkHeader';

export interface DiffLine {
  line_type: DiffLineType;
  old_lineno?: number;
  new_lineno?: number;
  content: string;
}

export interface DiffHunk {
  header: string;
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  old_path?: string;
  new_path?: string;
  is_binary: boolean;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export interface ConflictChunk {
  section_type:
    | 'Normal'
    | {
        Conflict: {
          ours: string;
          theirs: string;
          base?: string;
        };
      };
  resolved_content?: string;
}

export interface ConflictFileContent {
  file_path: string;
  ancestor?: string;
  ours?: string;
  theirs?: string;
  worktree?: string;
  chunks: ConflictChunk[];
  is_binary: boolean;
}
