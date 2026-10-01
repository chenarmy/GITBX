/**
 * Comprehensive Automated Verification Script for gitbx-4-test
 * 
 * Tests all key functional endpoints of GITBX (Axum Web Backend & Git Core Service)
 * directly against the I:\gitbx-4-test repository.
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const REPO_PATH = path.resolve('I:\\gitbx-4-test');
const PORT = 8099;
const TOKEN = 'gitbx-test-token-abc';
const BASE_URL = { hostname: '127.0.0.1', port: PORT };

function request(method, apiPath, data = null) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Authorization': `Bearer ${TOKEN}`,
    };
    if (data) {
      headers['Content-Type'] = 'application/json';
    }
    const req = http.request({
      ...BASE_URL,
      path: apiPath,
      method,
      headers,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHealth(maxRetries = 40) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
      });
      if (res.status === 200) return true;
    } catch {}
    await sleep(500);
  }
  return false;
}

let passedTests = 0;
let failedTests = 0;
const results = [];

function assert(description, condition, extraInfo = '') {
  if (condition) {
    passedTests++;
    results.push({ name: description, status: 'PASS', info: extraInfo });
    console.log(`  [PASS] ${description}`);
  } else {
    failedTests++;
    results.push({ name: description, status: 'FAIL', info: extraInfo });
    console.error(`  [FAIL] ${description} ${extraInfo ? '(' + extraInfo + ')' : ''}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log(` Starting GITBX Test Matrix on: ${REPO_PATH}`);
  console.log('====================================================\n');

  // Test 1: Health check
  console.log('[Module 1: Service Health & Core Engine]');
  const healthRes = await request('GET', '/api/health');
  assert('Web Server Health Check', healthRes.status === 200 && healthRes.body.ok === true);

  // Test 2: Repo info
  console.log('\n[Module 2: Repository Info & Discovery]');
  const infoRes = await request('GET', `/api/repo/info?path=${encodeURIComponent(REPO_PATH)}`);
  assert('Repository Info Query', infoRes.status === 200 && infoRes.body.name === 'gitbx-4-test', JSON.stringify(infoRes.body));
  assert('Active Branch is Master', infoRes.body && infoRes.body.head_branch === 'master', `branch: ${infoRes.body?.head_branch}`);

  // Test 3: Status
  console.log('\n[Module 3: Working Directory Status & Staging Area]');
  const statusRes = await request('GET', `/api/repo/status?path=${encodeURIComponent(REPO_PATH)}`);
  assert('Status Query Structure', statusRes.status === 200 && Array.isArray(statusRes.body.unstaged_files));

  // Test 4: Branches
  console.log('\n[Module 4: Branch Management]');
  const branchRes = await request('GET', `/api/repo/branches?path=${encodeURIComponent(REPO_PATH)}`);
  assert('List Branches', branchRes.status === 200 && Array.isArray(branchRes.body));
  const branchNames = (branchRes.body || []).map(b => b.name);
  assert('Develop branch exists', branchNames.includes('develop'));
  assert('Conflict branches exist', branchNames.includes('conflict/branch-a') && branchNames.includes('conflict/branch-b'));
  assert('Feature branches exist', branchNames.includes('feat/user-auth') && branchNames.includes('feat/payment'));

  // Create branch test
  const testBranchName = `test/auto-${Date.now()}`;
  const createBranchRes = await request('POST', '/api/repo/branch/create', {
    repo_path: REPO_PATH,
    name: testBranchName,
    checkout: false,
  });
  assert('Create temporary branch', createBranchRes.status === 200);

  // Delete branch test
  const deleteBranchRes = await request('POST', '/api/repo/branch/delete', {
    repo_path: REPO_PATH,
    name: testBranchName,
    force: true,
  });
  assert('Delete temporary branch', deleteBranchRes.status === 200);

  // Test 5: Tags
  console.log('\n[Module 5: Tags Management]');
  const tagsRes = await request('GET', `/api/repo/tags?path=${encodeURIComponent(REPO_PATH)}`);
  assert('List Tags', tagsRes.status === 200 && Array.isArray(tagsRes.body));
  const tagNames = (tagsRes.body || []).map(t => t.name);
  assert('Baseline tags v0.1.0 and v1.0.0-beta exist', tagNames.includes('v0.1.0') && tagNames.includes('v1.0.0-beta'));

  // Test 6: Remotes
  console.log('\n[Module 6: Remote Repository]');
  const remotesRes = await request('GET', `/api/repo/remotes?path=${encodeURIComponent(REPO_PATH)}`);
  assert('List Remotes', remotesRes.status === 200 && Array.isArray(remotesRes.body));
  const hasOrigin = (remotesRes.body || []).some(r => r.name === 'origin' && r.url.includes('gitee.com'));
  assert('Origin remote configured correctly', hasOrigin);

  // Test 7: Commit Graph
  console.log('\n[Module 7: Commit Topology Graph]');
  const graphRes = await request('GET', `/api/repo/graph?path=${encodeURIComponent(REPO_PATH)}&offset=0&limit=50`);
  assert('Fetch Commit Graph Page', graphRes.status === 200 && Array.isArray(graphRes.body.nodes));
  assert('Graph nodes count >= 5', graphRes.body.nodes && graphRes.body.nodes.length >= 5);
  const sampleCommit = graphRes.body.nodes ? graphRes.body.nodes[0] : null;
  assert('Graph node has lane layout & hash', sampleCommit && typeof sampleCommit.lane === 'number' && sampleCommit.id);

  // Test 8: Diff & File History & Blame
  console.log('\n[Module 8: Diff Engine, File History & Blame]');
  const historyRes = await request('GET', `/api/repo/file-history?path=${encodeURIComponent(REPO_PATH)}&file_path=README.md`);
  assert('File History for README.md', historyRes.status === 200 && Array.isArray(historyRes.body) && historyRes.body.length >= 1);

  const blameRes = await request('GET', `/api/repo/file-blame?path=${encodeURIComponent(REPO_PATH)}&file_path=README.md`);
  assert('File Blame for README.md', blameRes.status === 200 && Array.isArray(blameRes.body) && blameRes.body.length >= 1);

  // Test 9: Staging & Commits
  console.log('\n[Module 9: Staging & Commit Flow]');
  const scratchFile = 'src/test_scratch.txt';
  const scratchFullPath = path.join(REPO_PATH, scratchFile);
  fs.writeFileSync(scratchFullPath, 'Initial content for testing staging workflow\n', 'utf8');

  const stageRes = await request('POST', '/api/repo/stage', {
    repo_path: REPO_PATH,
    file_path: scratchFile,
  });
  assert('Stage single file', stageRes.status === 200);

  const unstageRes = await request('POST', '/api/repo/unstage', {
    repo_path: REPO_PATH,
    file_path: scratchFile,
  });
  assert('Unstage single file', unstageRes.status === 200);

  // Re-stage and commit
  await request('POST', '/api/repo/stage', { repo_path: REPO_PATH, file_path: scratchFile });
  const commitRes = await request('POST', '/api/repo/commit', {
    repo_path: REPO_PATH,
    message: 'test: automated staging test commit',
    author: 'GITBX AutoTester',
    email: 'autotest@gitbx.local',
  });
  assert('Create Commit', commitRes.status === 200 && commitRes.body.commit_id);

  // Clean up scratch file from git
  if (fs.existsSync(scratchFullPath)) {
    fs.unlinkSync(scratchFullPath);
  }
  await request('POST', '/api/repo/stage-all', { repo_path: REPO_PATH });
  await request('POST', '/api/repo/commit', {
    repo_path: REPO_PATH,
    message: 'test: cleanup scratch test file',
    author: 'GITBX AutoTester',
    email: 'autotest@gitbx.local',
  });

  // Test 10: Stash operations
  console.log('\n[Module 10: Stash Management]');
  const stashFile = path.join(REPO_PATH, 'src/math.ts');
  fs.appendFileSync(stashFile, '// Stash test change\n', 'utf8');

  const stashCreateRes = await request('POST', '/api/repo/stash/create', {
    repo_path: REPO_PATH,
    message: 'test stash entry',
  });
  assert('Create Stash', stashCreateRes.status === 200);

  const stashesRes = await request('GET', `/api/repo/stashes?path=${encodeURIComponent(REPO_PATH)}`);
  assert('List Stashes', stashesRes.status === 200 && Array.isArray(stashesRes.body) && stashesRes.body.length > 0);

  const stashPopRes = await request('POST', '/api/repo/stash/pop', {
    repo_path: REPO_PATH,
    index: 0,
  });
  assert('Pop Stash', stashPopRes.status === 200);

  // Discard the popped test change to clean working tree
  await request('POST', '/api/repo/discard', { repo_path: REPO_PATH, file_path: 'src/math.ts' });

  // Test 11: Worktree Operations
  console.log('\n[Module 11: Git Worktree Management]');
  await request('POST', '/api/repo/worktree/prune', { repo_path: REPO_PATH });
  const worktreeParent = path.join(REPO_PATH, 'worktrees');
  fs.mkdirSync(worktreeParent, { recursive: true });
  const worktreeDest = path.join(worktreeParent, 'auto-wt');
  if (fs.existsSync(worktreeDest)) {
    fs.rmSync(worktreeDest, { recursive: true, force: true });
  }

  const wtAddRes = await request('POST', '/api/repo/worktree/add', {
    repo_path: REPO_PATH,
    dest_path: worktreeDest,
    branch: 'hotfix/v1.0.1',
  });
  assert('Worktree Add', wtAddRes.status === 200, JSON.stringify(wtAddRes.body));

  const wtListRes = await request('GET', `/api/repo/worktrees?path=${encodeURIComponent(REPO_PATH)}`);
  assert('List Worktrees', wtListRes.status === 200 && Array.isArray(wtListRes.body));
  const linkedWt = (wtListRes.body || []).find(w => !w.is_main);
  assert('Linked Worktree Recognized', !!linkedWt);
  const targetWtPath = linkedWt ? linkedWt.path : worktreeDest;

  // Lock worktree
  const wtLockRes = await request('POST', '/api/repo/worktree/lock', {
    repo_path: REPO_PATH,
    worktree_path: targetWtPath,
    locked: true,
    reason: 'Testing worktree lock function',
  });
  assert('Lock Worktree', wtLockRes.status === 200, JSON.stringify(wtLockRes.body));

  // Unlock worktree
  await request('POST', '/api/repo/worktree/lock', {
    repo_path: REPO_PATH,
    worktree_path: targetWtPath,
    locked: false,
  });

  // Remove worktree
  const wtRemoveRes = await request('POST', '/api/repo/worktree/remove', {
    repo_path: REPO_PATH,
    worktree_path: targetWtPath,
    force: true,
  });
  assert('Remove Worktree', wtRemoveRes.status === 200, JSON.stringify(wtRemoveRes.body));

  // Test 12: Local History Snapshots
  console.log('\n[Module 12: Local History Snapshots]');
  const snapCreateRes = await request('POST', '/api/repo/local-history/create', {
    repo_path: REPO_PATH,
    file_path: 'README.md',
    label: 'Automated Snapshot Before Edit',
  });
  assert('Create Local History Snapshot', snapCreateRes.status === 200 && snapCreateRes.body.id);

  const snapListRes = await request('GET', `/api/repo/local-history?path=${encodeURIComponent(REPO_PATH)}&file_path=README.md`);
  assert('List Local History Snapshots', snapListRes.status === 200 && Array.isArray(snapListRes.body) && snapListRes.body.length > 0);

  // Test 13: Conflict Detection & Analysis
  console.log('\n[Module 13: 3-Way Merge Conflict Infrastructure]');
  // Notice we have conflict/branch-a and conflict/branch-b which both modified src/config.json from conflict/base
  const baseRev = await request('GET', `/api/repo/resolve-revision?path=${encodeURIComponent(REPO_PATH)}&revision=conflict/base`);
  const branchARev = await request('GET', `/api/repo/resolve-revision?path=${encodeURIComponent(REPO_PATH)}&revision=conflict/branch-a`);
  const branchBRev = await request('GET', `/api/repo/resolve-revision?path=${encodeURIComponent(REPO_PATH)}&revision=conflict/branch-b`);
  assert('Resolve Revisions for Conflict Branches', baseRev.status === 200 && branchARev.status === 200 && branchBRev.status === 200);

  const branchChangesRes = await request('GET', `/api/repo/branch-changes?path=${encodeURIComponent(REPO_PATH)}&base_revision=conflict/base&target_revision=conflict/branch-a`);
  assert('Compare Branch Changes (conflict/base vs conflict/branch-a)', branchChangesRes.status === 200 && Array.isArray(branchChangesRes.body));
  const hasConfigDiff = (branchChangesRes.body || []).some(f => f.path === 'src/config.json');
  assert('Detect modified config.json across branches', hasConfigDiff);

  // Test 14: Interactive Rebase Commits
  console.log('\n[Module 14: Interactive Rebase Commits Inquiry]');
  const rebaseCommitsRes = await request('GET', `/api/repo/rebase/commits?path=${encodeURIComponent(REPO_PATH)}&upstream=master`);
  assert('Get Interactive Rebase Commits from master', rebaseCommitsRes.status === 200 && Array.isArray(rebaseCommitsRes.body));

  // Test 15: Commit Template
  console.log('\n[Module 15: Commit Template]');
  const templateRes = await request('GET', `/api/repo/commit-template?path=${encodeURIComponent(REPO_PATH)}`);
  assert('Get Commit Template', templateRes.status === 200);

  console.log('\n====================================================');
  console.log(` Test Summary: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('====================================================');

  return { passedTests, failedTests, results };
}

async function main() {
  console.log('1. Launching gitbx-web on port ' + PORT + '...');
  const serverProc = spawn('cargo', ['run', '-p', 'gitbx-web'], {
    cwd: path.resolve('I:\\GITBX'),
    env: {
      ...process.env,
      GITBX_ALLOWED_REPOS: REPO_PATH,
      GITBX_WEB_TOKEN: TOKEN,
      GITBX_WEB_PORT: String(PORT),
      GITBX_WEB_HOST: '127.0.0.1',
    },
    stdio: 'pipe',
  });

  serverProc.stdout.on('data', d => {
    // console.log(`[web] ${d}`);
  });
  serverProc.stderr.on('data', d => {
    // console.error(`[web err] ${d}`);
  });

  try {
    const ready = await waitForHealth();
    if (!ready) {
      throw new Error('gitbx-web did not become healthy within the timeout window.');
    }
    console.log('gitbx-web is healthy and ready on port ' + PORT + '!\n');

    const outcome = await runTests();
    if (outcome.failedTests > 0) {
      process.exitCode = 1;
    }
  } finally {
    console.log('\nStopping gitbx-web server...');
    serverProc.kill();
  }
}

main().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
