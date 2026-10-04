import {
  getRepoStatus,
  getRepoInfo,
  listBranches,
  checkoutBranch,
  createBranch,
  stageFile,
  stageAll,
  unstageFile,
  unstageAll,
  createCommit,
  createStash,
  popStash,
} from '@/api/domain/gitRepoApi';
import { getCommitGraph } from '@/api/domain/historyApi';
import { getFileDiff } from '@/api/domain/gitDiffApi';
import { CONFIG_KEYS } from '@/services/appConfig';
import type { AiToolName, AiToolCall } from '@/types/ai';

export const AI_AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Get current git repository status including branch, staged files, unstaged files, and untracked files.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Get the diff of a specific file or staged changes in the repository.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Relative path of the file to inspect diff for. If empty, checks general diff.',
          },
          staged: {
            type: 'boolean',
            description: 'Whether to check staged changes diff.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_log',
      description: 'Get recent git commit history for the current branch.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of commits to retrieve (default: 10).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_branch',
      description: 'List all local and remote branches in the repository.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_git_command',
      description: 'Execute a Git action in the repository such as checkout, create branch, commit, stage, or push. Destructive operations will require user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The git command to execute (e.g. "checkout", "create_branch", "stage", "commit", "stash").',
          },
          branch_name: {
            type: 'string',
            description: 'Branch name for checkout, create, or delete.',
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'File paths for stage or unstage.',
          },
          commit_message: {
            type: 'string',
            description: 'Commit message for commit operation.',
          },
          raw_command: {
            type: 'string',
            description: 'Human-readable raw shell command to preview for user approval.',
          },
        },
        required: ['command'],
      },
    },
  },
];

export function determineRiskLevel(name: AiToolName, args: Record<string, any>): 'safe' | 'destructive' {
  if (name === 'git_status' || name === 'git_diff' || name === 'git_log' || name === 'git_branch') {
    return 'safe';
  }
  if (name === 'run_git_command') {
    const cmd = (args.command || '').toLowerCase();
    if (cmd === 'status' || cmd === 'log' || cmd === 'diff' || cmd === 'branch') {
      return 'safe';
    }
    return 'destructive';
  }
  return 'safe';
}

export function formatCommandPreview(name: AiToolName, args: Record<string, any>): string {
  if (name === 'git_status') return 'git status';
  if (name === 'git_diff') return `git diff ${args.staged ? '--staged ' : ''}${args.file_path || ''}`.trim();
  if (name === 'git_log') return `git log -n ${args.limit || 10} --oneline`;
  if (name === 'git_branch') return 'git branch -a';
  if (name === 'run_git_command') {
    if (args.raw_command) return args.raw_command;
    const cmd = args.command;
    if (cmd === 'checkout') return `git checkout "${args.branch_name}"`;
    if (cmd === 'create_branch') return `git checkout -b "${args.branch_name}"`;
    if (cmd === 'stage') return `git add ${(args.files || []).join(' ') || '.'}`;
    if (cmd === 'commit') return `git commit -m "${args.commit_message || ''}"`;
    if (cmd === 'stash') return 'git stash';
    if (cmd === 'stash_pop') return 'git stash pop';
    return `git ${cmd}`;
  }
  return `${name} ${JSON.stringify(args)}`;
}

export async function executeGitTool(
  toolCall: AiToolCall,
  repoPath: string,
): Promise<string> {
  const { name, arguments: args } = toolCall;

  try {
    switch (name) {
      case 'git_status': {
        const status = await getRepoStatus(repoPath);
        const info = await getRepoInfo(repoPath).catch(() => null);
        return JSON.stringify(
          {
            head_branch: info?.head_branch,
            total_changes: status.total_changes,
            staged_files: status.staged_files.map((f) => ({ path: f.path, status: f.staged_status })),
            unstaged_files: status.unstaged_files.map((f) => ({ path: f.path, status: f.unstaged_status })),
            untracked_files: status.untracked_files.map((f) => ({ path: f.path })),
            conflicted_files: status.conflicted_files.map((f) => ({ path: f.path })),
          },
          null,
          2,
        );
      }

      case 'git_diff': {
        const diff = await getFileDiff(
          repoPath,
          args.file_path || '',
          Boolean(args.staged),
        );
        return JSON.stringify(
          {
            old_path: diff.old_path,
            new_path: diff.new_path,
            additions: diff.additions,
            deletions: diff.deletions,
            hunks_count: diff.hunks.length,
            hunks_preview: diff.hunks.slice(0, 3).map((h) => ({
              header: h.header,
              lines: h.lines.slice(0, 15).map((l) => `${l.line_type}: ${l.content}`),
            })),
          },
          null,
          2,
        );
      }

      case 'git_log': {
        const limit = args.limit || 10;
        const page = await getCommitGraph(repoPath, 0, limit);
        return JSON.stringify(
          page.nodes.map((c) => ({
            id: c.short_id || c.id.substring(0, 8),
            summary: c.summary,
            author: c.author_name,
            timestamp: c.author_time,
          })),
          null,
          2,
        );
      }

      case 'git_branch': {
        const branches = await listBranches(repoPath);
        return JSON.stringify(
          branches.map((b) => ({
            name: b.name,
            is_head: b.is_head,
            is_remote: b.is_remote,
            upstream: b.upstream_name,
            ahead: b.ahead_count,
            behind: b.behind_count,
          })),
          null,
          2,
        );
      }

      case 'run_git_command': {
        const cmd = (args.command || '').toLowerCase();
        if (cmd === 'checkout' && args.branch_name) {
          const res = await checkoutBranch(repoPath, args.branch_name);
          return `Switched to branch '${args.branch_name}' (conflicts: ${res.conflicts})`;
        }
        if (cmd === 'create_branch' && args.branch_name) {
          await createBranch(repoPath, args.branch_name);
          return `Created and checked out branch '${args.branch_name}'`;
        }
        if (cmd === 'stage') {
          if (Array.isArray(args.files) && args.files.length > 0) {
            for (const f of args.files) {
              await stageFile(repoPath, f);
            }
            return `Staged ${args.files.length} file(s): ${args.files.join(', ')}`;
          } else {
            await stageAll(repoPath);
            return 'Staged all changes';
          }
        }
        if (cmd === 'unstage') {
          if (Array.isArray(args.files) && args.files.length > 0) {
            for (const f of args.files) {
              await unstageFile(repoPath, f);
            }
            return `Unstaged ${args.files.length} file(s): ${args.files.join(', ')}`;
          } else {
            await unstageAll(repoPath);
            return 'Unstaged all changes';
          }
        }
        if (cmd === 'commit' && args.commit_message) {
          const author = localStorage.getItem(CONFIG_KEYS.authorName) || 'GITBX User';
          const email = localStorage.getItem(CONFIG_KEYS.authorEmail) || 'user@gitbx.local';
          const commitId = await createCommit(repoPath, args.commit_message, author, email);
          return `Committed changes with commit hash ${commitId}`;
        }
        if (cmd === 'stash') {
          await createStash(repoPath, args.message || 'AI Stash');
          return 'Saved changes to stash';
        }
        if (cmd === 'stash_pop') {
          await popStash(repoPath, 0);
          return 'Restored stash';
        }
        return `Command '${cmd}' execution completed.`;
      }

      default:
        throw new Error(`Unknown tool name: ${name}`);
    }
  } catch (error: any) {
    throw new Error(error?.message || String(error));
  }
}
