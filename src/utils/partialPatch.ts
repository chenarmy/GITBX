import type { DiffHunk, DiffLine, DiffLineType } from '@/types/diff';

type PatchLine = Pick<DiffLine, 'line_type' | 'content'>;

function selectLines(
  hunk: DiffHunk,
  selectedLineIndex?: number,
  contextSide: 'old' | 'new' = 'old',
): PatchLine[] {
  if (selectedLineIndex === undefined) {
    return hunk.lines.map(({ line_type, content }) => ({ line_type, content }));
  }

  const selected = hunk.lines[selectedLineIndex];
  if (!selected || (selected.line_type !== 'Addition' && selected.line_type !== 'Deletion')) {
    throw new Error('Select an added or deleted line to build a partial patch.');
  }

  return hunk.lines.flatMap(({ line_type, content }, index): PatchLine[] => {
    if (line_type === 'Context' || index === selectedLineIndex) return [{ line_type, content }];
    // A partial patch must describe the state of the target it is applied to.
    // Forward patches apply to the old side; reverse patches apply to the new
    // side. Unselected changes therefore become context only on that side.
    if (contextSide === 'old' && line_type === 'Deletion') {
      return [{ line_type: 'Context', content }];
    }
    if (contextSide === 'new' && line_type === 'Addition') {
      return [{ line_type: 'Context', content }];
    }
    return [];
  });
}

function reverseLines(lines: PatchLine[]): PatchLine[] {
  const result: PatchLine[] = [];
  let changeBlock: PatchLine[] = [];
  const flush = () => {
    if (!changeBlock.length) return;
    for (const line of changeBlock.filter((item) => item.line_type === 'Addition')) {
      result.push({ line_type: 'Deletion', content: line.content });
    }
    for (const line of changeBlock.filter((item) => item.line_type === 'Deletion')) {
      result.push({ line_type: 'Addition', content: line.content });
    }
    changeBlock = [];
  };

  for (const line of lines) {
    if (line.line_type === 'Context') {
      flush();
      result.push(line);
    } else {
      changeBlock.push(line);
    }
  }
  flush();
  return result;
}

function countRange(lines: PatchLine[], side: 'old' | 'new'): number {
  return lines.filter((line) => side === 'old'
    ? line.line_type !== 'Addition'
    : line.line_type !== 'Deletion').length;
}

function prefix(lineType: DiffLineType): string {
  if (lineType === 'Addition') return '+';
  if (lineType === 'Deletion') return '-';
  return ' ';
}

export function buildPartialPatch(
  filePath: string,
  hunk: DiffHunk,
  options: { selectedLineIndex?: number; reverse?: boolean } = {},
): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (!normalizedPath || /[\r\n]/.test(normalizedPath)) {
    throw new Error('The selected file path is not valid for a patch.');
  }

  const forwardLines = selectLines(
    hunk,
    options.selectedLineIndex,
    options.reverse ? 'new' : 'old',
  );
  const lines = options.reverse ? reverseLines(forwardLines) : forwardLines;
  if (!lines.some((line) => line.line_type === 'Addition' || line.line_type === 'Deletion')) {
    throw new Error('The selected patch contains no changes.');
  }

  const forwardOldCount = countRange(forwardLines, 'old');
  const forwardNewCount = countRange(forwardLines, 'new');
  const oldStart = options.reverse ? hunk.new_start : hunk.old_start;
  const newStart = options.reverse ? hunk.old_start : hunk.new_start;
  const oldCount = options.reverse ? forwardNewCount : forwardOldCount;
  const newCount = options.reverse ? forwardOldCount : forwardNewCount;
  const body = lines.map((line) => `${prefix(line.line_type)}${line.content}\n`).join('');

  return [
    `diff --git a/${normalizedPath} b/${normalizedPath}\n`,
    `--- a/${normalizedPath}\n`,
    `+++ b/${normalizedPath}\n`,
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n`,
    body,
  ].join('');
}
