import type { Plugin } from 'vite';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export function gitbxDevPlugin(): Plugin {
  return {
    name: 'vite-plugin-gitbx-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const repoPath = url.searchParams.get('path') || process.cwd();

        const execGit = async (cmd: string, customCwd?: string) => {
          const cwd = customCwd || repoPath;
          const { stdout } = await execAsync(`git ${cmd}`, { cwd, maxBuffer: 15 * 1024 * 1024 });
          return stdout.trim();
        };

        const jsonResponse = (data: any, status = 200) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify(data));
        };

        const errorResponse = (err: any, status = 500) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: err.message || String(err) }));
        };

        // 0. POST /api/repo/validate
        if (url.pathname === '/api/repo/validate') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const target = data.path || repoPath;
              if (!fs.existsSync(target)) {
                return jsonResponse({ valid: false, message: 'Directory does not exist' });
              }
              const isGit = fs.existsSync(path.join(target, '.git'));
              if (!isGit) {
                try {
                  const root = await execGit('rev-parse --show-toplevel', target);
                  return jsonResponse({ valid: true, path: root, name: path.basename(root) });
                } catch {
                  return jsonResponse({ valid: false, message: 'Not a Git repository' });
                }
              }
              return jsonResponse({ valid: true, path: target, name: path.basename(target) });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        // 0.1 POST /api/repo/init
        if (url.pathname === '/api/repo/init' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              if (!fs.existsSync(data.path)) {
                fs.mkdirSync(data.path, { recursive: true });
              }
              await execGit('init', data.path);
              return jsonResponse({ success: true, path: data.path, name: path.basename(data.path) });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        // 0.2 POST /api/repo/clone
        if (url.pathname === '/api/repo/clone' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const parentDir = path.dirname(data.destination);
              if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
              }
              await execAsync(`git clone "${data.url}" "${data.destination}"`, { maxBuffer: 25 * 1024 * 1024 });
              return jsonResponse({ success: true, path: data.destination, name: path.basename(data.destination) });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        // 1. GET /api/repo/info
        if (url.pathname === '/api/repo/info') {
          try {
            let branch = 'HEAD';
            try {
              branch = await execGit('branch --show-current');
            } catch {}
            let headOid = '';
            try {
              headOid = await execGit('rev-parse HEAD');
            } catch {}
            let status = '';
            try {
              status = await execGit('status --porcelain');
            } catch {}
            let remotes: string[] = [];
            try {
              remotes = (await execGit('remote')).split('\n').filter(Boolean);
            } catch {}

            const gitDir = path.join(repoPath, '.git');
            const isMerging = fs.existsSync(path.join(gitDir, 'MERGE_HEAD'));
            const isRebasing = fs.existsSync(path.join(gitDir, 'rebase-merge')) || fs.existsSync(path.join(gitDir, 'rebase-apply'));
            const isCherryPicking = fs.existsSync(path.join(gitDir, 'CHERRY_PICK_HEAD'));

            return jsonResponse({
              name: path.basename(repoPath),
              path: repoPath,
              is_bare: false,
              head_branch: branch || 'HEAD',
              head_commit_id: headOid,
              is_dirty: status.length > 0,
              remotes,
              is_merging: isMerging,
              is_rebasing: isRebasing,
              is_cherry_picking: isCherryPicking,
            });
          } catch (err: any) {
            return errorResponse(err);
          }
        }

        // 2. GET /api/repo/status
        if (url.pathname === '/api/repo/status') {
          try {
            let rawStatus = '';
            try {
              rawStatus = await execGit('status --porcelain=v1');
            } catch {}
            const lines = rawStatus.split('\n').filter(Boolean);

            const staged_files: any[] = [];
            const unstaged_files: any[] = [];
            const untracked_files: any[] = [];
            const conflicted_files: any[] = [];

            const mapStatus = (code: string) => {
              switch (code) {
                case 'A': return 'Added';
                case 'M': return 'Modified';
                case 'D': return 'Deleted';
                case 'R': return 'Renamed';
                case 'U': return 'Conflicted';
                case '?': return 'Untracked';
                default: return 'Unmodified';
              }
            };

            for (const line of lines) {
              const x = line[0];
              const y = line[1];
              const filePath = line.substring(3).trim();

              if (x === '?' && y === '?') {
                untracked_files.push({
                  path: filePath,
                  staged_status: 'Untracked',
                  unstaged_status: 'Untracked',
                  is_staged: false,
                  is_conflicted: false,
                });
              } else if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
                conflicted_files.push({
                  path: filePath,
                  staged_status: 'Conflicted',
                  unstaged_status: 'Conflicted',
                  is_staged: false,
                  is_conflicted: true,
                });
              } else {
                if (x !== ' ' && x !== '?') {
                  staged_files.push({
                    path: filePath,
                    staged_status: mapStatus(x),
                    unstaged_status: 'Unmodified',
                    is_staged: true,
                    is_conflicted: false,
                  });
                }
                if (y !== ' ' && y !== '?') {
                  unstaged_files.push({
                    path: filePath,
                    staged_status: 'Unmodified',
                    unstaged_status: mapStatus(y),
                    is_staged: false,
                    is_conflicted: false,
                  });
                }
              }
            }

            return jsonResponse({
              staged_files,
              unstaged_files,
              untracked_files,
              conflicted_files,
              total_changes: lines.length,
            });
          } catch (err: any) {
            return errorResponse(err);
          }
        }

        // 3. GET /api/repo/branches
        if (url.pathname === '/api/repo/branches') {
          try {
            let raw = '';
            try {
              raw = await execGit('branch -a -v --no-abbrev');
            } catch {}
            let currentHead = '';
            try {
              currentHead = await execGit('branch --show-current');
            } catch {}

            const branches = raw
              .split('\n')
              .filter(Boolean)
              .map((line) => {
                const isHead = line.startsWith('*');
                const clean = line.replace(/^[\*\s]+/, '').trim();
                const parts = clean.split(/\s+/);
                const name = parts[0];
                const oid = parts[1] || '';
                return {
                  name,
                  is_head: isHead || name === currentHead,
                  is_remote: name.startsWith('remotes/'),
                  target_commit_id: oid,
                  ahead_count: 0,
                  behind_count: 0,
                };
              });

            return jsonResponse(branches);
          } catch (err: any) {
            return errorResponse(err);
          }
        }

        // 3.1 Branch operations (create, checkout, delete, rename, track)
        if (url.pathname === '/api/repo/branch/create' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const target = data.start_point ? ` "${data.start_point}"` : '';
              if (data.checkout) {
                await execGit(`checkout -b "${data.name}"${target}`, data.repo_path);
              } else {
                await execGit(`branch "${data.name}"${target}`, data.repo_path);
              }
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/branch/checkout' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              let branchName = data.name;
              if (branchName.startsWith('remotes/origin/')) {
                branchName = branchName.replace('remotes/origin/', '');
              }
              await execGit(`checkout "${branchName}"`, data.repo_path);
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/branch/delete' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const forceFlag = data.force ? '-D' : '-d';
              await execGit(`branch ${forceFlag} "${data.name}"`, data.repo_path);
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/branch/rename' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              await execGit(`branch -m "${data.old_name}" "${data.new_name}"`, data.repo_path);
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        // 4. GET /api/repo/graph
        if (url.pathname === '/api/repo/graph') {
          try {
            const max = url.searchParams.get('max') || '100';
            let raw = '';
            try {
              raw = await execGit(`log -n ${max} --pretty=format:"%H|%h|%P|%an|%at|%s|%D"`);
            } catch {}
            const lines = raw.split('\n').filter(Boolean);

            const activeLanes: (string | null)[] = [];
            const commits = lines.map((line) => {
              const [id, short_id, parent_str, author_name, at_str, summary, refs_str] = line.split('|');
              const parent_ids = (parent_str || '').split(' ').filter(Boolean);

              let lane = activeLanes.findIndex((p) => p === id);
              if (lane === -1) {
                lane = activeLanes.findIndex((p) => p === null);
                if (lane === -1) {
                  lane = activeLanes.length;
                  activeLanes.push(null);
                }
              }

              if (parent_ids.length > 0) {
                activeLanes[lane] = parent_ids[0];
              } else {
                activeLanes[lane] = null;
              }

              const edges = parent_ids.map((pid, idx) => ({
                from_lane: lane,
                to_lane: idx === 0 ? lane : lane + 1,
                parent_id: pid,
                edge_type: (idx === 0 ? 'Straight' : 'Merge') as any,
              }));

              const branch_refs: string[] = [];
              const tag_refs: string[] = [];
              if (refs_str) {
                refs_str.split(',').forEach((r) => {
                  const ref = r.trim();
                  if (ref.startsWith('tag: ')) {
                    tag_refs.push(ref.replace('tag: ', ''));
                  } else if (ref) {
                    branch_refs.push(ref);
                  }
                });
              }

              return {
                id,
                short_id,
                summary,
                author_name,
                author_time: parseInt(at_str || '0', 10),
                parent_ids,
                lane,
                edges,
                branch_refs,
                tag_refs,
                is_head: branch_refs.some((r) => r.includes('HEAD')),
              };
            });

            return jsonResponse(commits);
          } catch (err: any) {
            return errorResponse(err);
          }
        }

        // 5. Tags
        if (url.pathname === '/api/repo/tags') {
          try {
            let raw = '';
            try {
              raw = await execGit('tag -l -n1');
            } catch {}
            const tags = raw
              .split('\n')
              .filter(Boolean)
              .map((line) => {
                const parts = line.trim().split(/\s+/);
                const name = parts[0];
                const msg = parts.slice(1).join(' ');
                return { name, message: msg || undefined, target_commit_id: '' };
              });
            return jsonResponse(tags);
          } catch (err: any) {
            return errorResponse(err);
          }
        }

        if (url.pathname === '/api/repo/tag/create' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const msgArg = data.message ? ` -m "${data.message}"` : '';
              const targetArg = data.commit_id ? ` "${data.commit_id}"` : '';
              await execGit(`tag "${data.name}"${msgArg}${targetArg}`, data.repo_path);
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        // 6. Stashes
        if (url.pathname === '/api/repo/stashes') {
          try {
            let raw = '';
            try {
              raw = await execGit('stash list');
            } catch {}
            const stashes = raw
              .split('\n')
              .filter(Boolean)
              .map((line, idx) => ({
                index: idx,
                message: line,
                commit_id: '',
              }));
            return jsonResponse(stashes);
          } catch (err: any) {
            return errorResponse(err);
          }
        }

        if (url.pathname === '/api/repo/stash/create' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const msgArg = data.message ? ` push -m "${data.message}"` : '';
              await execGit(`stash${msgArg}`, data.repo_path);
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/stash/pop' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const index = data.index ?? 0;
              await execGit(`stash pop stash@{${index}}`, data.repo_path);
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        // 7. Staging, Unstaging, Discard
        if (url.pathname === '/api/repo/stage' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              await execGit(`add "${data.file_path}"`, data.repo_path);
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/stage-all' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              await execGit('add -A', data.repo_path);
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/unstage' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              await execGit(`restore --staged "${data.file_path}"`, data.repo_path);
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/unstage-all' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              await execGit('restore --staged .', data.repo_path);
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/discard' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              if (data.file_path) {
                try {
                  await execGit(`restore "${data.file_path}"`, data.repo_path);
                } catch {
                  await execGit(`clean -f "${data.file_path}"`, data.repo_path);
                }
              } else {
                await execGit('restore .', data.repo_path);
                await execGit('clean -fd', data.repo_path);
              }
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        // 8. Commit
        if (url.pathname === '/api/repo/commit' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const authorArg = data.author && data.email ? ` --author="${data.author} <${data.email}>"` : '';
              const { stdout } = await execAsync(
                `git commit -m "${data.message.replace(/"/g, '\\"')}"${authorArg}`,
                { cwd: data.repo_path || repoPath }
              );
              return jsonResponse({ success: true, output: stdout });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        // 9. Diff & Compare
        if (url.pathname === '/api/repo/diff') {
          try {
            const filePath = url.searchParams.get('file') || '';
            const staged = url.searchParams.get('staged') === 'true';
            const commitId = url.searchParams.get('commit');
            const compareWith = url.searchParams.get('compare');

            let rawDiff = '';
            if (compareWith) {
              rawDiff = await execGit(`diff "${compareWith}"`);
            } else if (commitId) {
              rawDiff = await execGit(`show ${commitId} -- "${filePath}"`);
            } else if (staged) {
              rawDiff = await execGit(`diff --cached -- "${filePath}"`);
            } else {
              rawDiff = await execGit(`diff -- "${filePath}"`);
              if (!rawDiff && filePath) {
                const full = path.join(repoPath, filePath);
                if (fs.existsSync(full) && fs.statSync(full).isFile()) {
                  const content = fs.readFileSync(full, 'utf-8');
                  const lineCount = content.split('\n').length;
                  rawDiff = `@@ -0,0 +1,${lineCount} @@\n` + content.split('\n').map((l) => `+${l}`).join('\n');
                }
              }
            }

            return jsonResponse({ raw_diff: rawDiff, file: filePath });
          } catch (err: any) {
            return errorResponse(err);
          }
        }

        // 10. MERGE OPERATIONS
        if (url.pathname === '/api/repo/merge' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              let flags = '';
              if (data.strategy === 'no-ff') flags += ' --no-ff';
              else if (data.strategy === 'squash') flags += ' --squash';
              else if (data.strategy === 'ff-only') flags += ' --ff-only';

              if (data.message) {
                flags += ` -m "${data.message}"`;
              }

              const out = await execGit(`merge "${data.target}"${flags}`, data.repo_path);
              return jsonResponse({ success: true, output: out });
            } catch (err: any) {
              return jsonResponse({ success: false, conflict: true, error: err.message });
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/merge/abort' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              await execGit('merge --abort', data.repo_path);
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        // 11. REBASE OPERATIONS
        if (url.pathname === '/api/repo/rebase' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const out = await execGit(`rebase "${data.upstream}"`, data.repo_path);
              return jsonResponse({ success: true, output: out });
            } catch (err: any) {
              return jsonResponse({ success: false, conflict: true, error: err.message });
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/rebase/continue' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const out = await execGit('rebase --continue', data.repo_path);
              return jsonResponse({ success: true, output: out });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/rebase/abort' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              await execGit('rebase --abort', data.repo_path);
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        // 12. CHERRY-PICK OPERATIONS
        if (url.pathname === '/api/repo/cherry-pick' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const out = await execGit(`cherry-pick "${data.commit_id}"`, data.repo_path);
              return jsonResponse({ success: true, output: out });
            } catch (err: any) {
              return jsonResponse({ success: false, conflict: true, error: err.message });
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/cherry-pick/continue' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const out = await execGit('cherry-pick --continue', data.repo_path);
              return jsonResponse({ success: true, output: out });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/cherry-pick/abort' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              await execGit('cherry-pick --abort', data.repo_path);
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        // 13. REVERT & RESET OPERATIONS
        if (url.pathname === '/api/repo/revert' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const out = await execGit(`revert "${data.commit_id}" --no-edit`, data.repo_path);
              return jsonResponse({ success: true, output: out });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/reset' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const mode = data.mode || '--mixed';
              await execGit(`reset ${mode} "${data.target}"`, data.repo_path);
              return jsonResponse({ success: true });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        // 14. Worktree operations
        if (url.pathname === '/api/repo/worktree/add' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const out = await execGit(`worktree add "${data.dest_path}" "${data.branch}"`, data.repo_path);
              return jsonResponse({ success: true, output: out });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        // 15. Fetch, Pull, Push
        if (url.pathname === '/api/repo/fetch' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const out = await execGit('fetch --all', data.repo_path);
              return jsonResponse({ success: true, output: out });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/pull' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const out = await execGit('pull', data.repo_path);
              return jsonResponse({ success: true, output: out });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        if (url.pathname === '/api/repo/push' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              const out = await execGit('push', data.repo_path);
              return jsonResponse({ success: true, output: out });
            } catch (err: any) {
              return errorResponse(err);
            }
          });
          return;
        }

        next();
      });
    },
  };
}
