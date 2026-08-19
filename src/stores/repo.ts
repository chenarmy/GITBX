import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { RepositoryInfo, RepoStatusSummary, BranchItem } from '@/types/git';
import type { GraphCommitNode } from '@/types/graph';
import { useGitApi } from '@/composables/useGitApi';

export const useRepoStore = defineStore('repo', () => {
  const gitApi = useGitApi();
  const activeRepoPath = ref<string>('i:/GITBX');
  const repoInfo = ref<RepositoryInfo | null>(null);
  const statusSummary = ref<RepoStatusSummary>({
    staged_files: [],
    unstaged_files: [],
    untracked_files: [],
    conflicted_files: [],
    total_changes: 0,
  });
  const branches = ref<BranchItem[]>([]);
  const commitNodes = ref<GraphCommitNode[]>([]);
  const selectedCommit = ref<GraphCommitNode | null>(null);
  const isLoading = ref<boolean>(false);

  const loadRepo = async (path: string) => {
    isLoading.value = true;
    activeRepoPath.value = path;
    try {
      repoInfo.value = await gitApi.getRepoInfo(path);
      statusSummary.value = await gitApi.getRepoStatus(path);
      branches.value = await gitApi.listBranches(path);
      commitNodes.value = await gitApi.getCommitGraph(path, 100);
      if (commitNodes.value.length > 0) {
        selectedCommit.value = commitNodes.value[0];
      }
    } catch (err) {
      console.warn('Fallback to mock repo data for demonstration:', err);
      // Populate rich default mock data so UI is instantly interactive
      repoInfo.value = {
        name: 'GITBX',
        path: path,
        is_bare: false,
        head_branch: 'main',
        head_commit_id: 'c8f1a23',
        is_dirty: true,
        remotes: ['origin'],
      };
      statusSummary.value = {
        staged_files: [
          {
            path: 'crates/gitbx-core/src/lib.rs',
            staged_status: 'Modified',
            unstaged_status: 'Unmodified',
            is_staged: true,
            is_conflicted: false,
          },
          {
            path: 'src/components/graph/CommitGraphCanvas.vue',
            staged_status: 'Added',
            unstaged_status: 'Unmodified',
            is_staged: true,
            is_conflicted: false,
          },
        ],
        unstaged_files: [
          {
            path: 'src-tauri/src/main.rs',
            staged_status: 'Unmodified',
            unstaged_status: 'Modified',
            is_staged: false,
            is_conflicted: false,
          },
          {
            path: 'package.json',
            staged_status: 'Unmodified',
            unstaged_status: 'Modified',
            is_staged: false,
            is_conflicted: false,
          },
        ],
        untracked_files: [
          {
            path: 'crates/gitbx-ai/src/secret_scanner.rs',
            staged_status: 'Untracked',
            unstaged_status: 'Untracked',
            is_staged: false,
            is_conflicted: false,
          },
        ],
        conflicted_files: [],
        total_changes: 5,
      };
      branches.value = [
        {
          name: 'main',
          is_head: true,
          is_remote: false,
          target_commit_id: 'c8f1a23',
          upstream_name: 'origin/main',
          ahead_count: 1,
          behind_count: 0,
        },
        {
          name: 'feat/graph-canvas',
          is_head: false,
          is_remote: false,
          target_commit_id: 'd9e2b41',
          upstream_name: undefined,
          ahead_count: 0,
          behind_count: 0,
        },
        {
          name: 'feat/ai-mcp',
          is_head: false,
          is_remote: false,
          target_commit_id: 'a1b2c3d',
          upstream_name: undefined,
          ahead_count: 0,
          behind_count: 0,
        },
      ];
      commitNodes.value = [
        {
          id: 'c8f1a234567890abcdef1234567890abcdef1234',
          short_id: 'c8f1a23',
          summary: 'feat(graph): implement high performance Canvas commit topology tree',
          author_name: 'Antigravity Developer',
          author_time: Date.now() / 1000 - 3600,
          parent_ids: ['d9e2b414567890abcdef1234567890abcdef1234'],
          lane: 0,
          edges: [
            { from_lane: 0, to_lane: 0, parent_id: 'd9e2b41', edge_type: 'Straight' },
          ],
          branch_refs: ['HEAD -> main', 'origin/main'],
          tag_refs: ['v0.1.0'],
          is_head: true,
        },
        {
          id: 'd9e2b414567890abcdef1234567890abcdef1234',
          short_id: 'd9e2b41',
          summary: 'merge: pull request #42 from feat/ai-mcp',
          author_name: 'GITBX Core Team',
          author_time: Date.now() / 1000 - 7200,
          parent_ids: ['a1b2c3d', 'b2c3d4e'],
          lane: 0,
          edges: [
            { from_lane: 0, to_lane: 0, parent_id: 'a1b2c3d', edge_type: 'Straight' },
            { from_lane: 0, to_lane: 1, parent_id: 'b2c3d4e', edge_type: 'Merge' },
          ],
          branch_refs: [],
          tag_refs: [],
          is_head: false,
        },
        {
          id: 'b2c3d4e4567890abcdef1234567890abcdef1234',
          short_id: 'b2c3d4e',
          summary: 'feat(mcp): expose Model Context Protocol server tools for AI agents',
          author_name: 'AI Agent Architect',
          author_time: Date.now() / 1000 - 10800,
          parent_ids: ['a1b2c3d'],
          lane: 1,
          edges: [
            { from_lane: 1, to_lane: 0, parent_id: 'a1b2c3d', edge_type: 'Fork' },
          ],
          branch_refs: ['feat/ai-mcp'],
          tag_refs: [],
          is_head: false,
        },
        {
          id: 'a1b2c3d4567890abcdef1234567890abcdef1234',
          short_id: 'a1b2c3d',
          summary: 'chore: initial Rust workspace setup and Tauri 2.0 shell',
          author_name: 'GITBX Core Team',
          author_time: Date.now() / 1000 - 14400,
          parent_ids: [],
          lane: 0,
          edges: [],
          branch_refs: [],
          tag_refs: [],
          is_head: false,
        },
      ];
      selectedCommit.value = commitNodes.value[0];
    } finally {
      isLoading.value = false;
    }
  };

  const stageFile = async (filePath: string) => {
    await gitApi.stageFile(activeRepoPath.value, filePath);
    await loadRepo(activeRepoPath.value);
  };

  const unstageFile = async (filePath: string) => {
    await gitApi.unstageFile(activeRepoPath.value, filePath);
    await loadRepo(activeRepoPath.value);
  };

  const commit = async (message: string, author: string, email: string) => {
    await gitApi.createCommit(activeRepoPath.value, message, author, email);
    await loadRepo(activeRepoPath.value);
  };

  return {
    activeRepoPath,
    repoInfo,
    statusSummary,
    branches,
    commitNodes,
    selectedCommit,
    isLoading,
    loadRepo,
    stageFile,
    unstageFile,
    commit,
  };
});
