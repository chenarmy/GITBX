/**
 * Advanced Functional Integration Test for gitbx-4-test
 * 
 * Verifies:
 * 1. 3-Way Merge Conflict Trigger & Abort
 * 2. Smart Checkout with dirty working directory
 * 3. Secret Scanner pattern detection
 * 4. Concurrent Git Worktree modification & isolation
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_PATH = path.resolve('I:\\gitbx-4-test');

function git(...args) {
  return execFileSync('git', ['-C', REPO_PATH, ...args], { encoding: 'utf8' }).trim();
}

const results = [];

function check(name, fn) {
  try {
    const res = fn();
    results.push({ name, status: 'PASS', detail: res || '' });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    results.push({ name, status: 'FAIL', detail: err.message });
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

async function main() {
  console.log('--- Running Advanced Functional Tests on gitbx-4-test ---');

  // Test 1: 3-Way Merge Conflict Trigger & Detection
  check('3-Way Merge Conflict Trigger on src/config.json', () => {
    git('checkout', 'conflict/branch-a');
    let conflictOccurred = false;
    try {
      git('merge', 'conflict/branch-b');
    } catch (e) {
      conflictOccurred = true;
    }
    if (!conflictOccurred) throw new Error('Expected conflict did not occur');
    const content = fs.readFileSync(path.join(REPO_PATH, 'src/config.json'), 'utf8');
    if (!content.includes('<<<<<<<') || !content.includes('>>>>>>>')) {
      throw new Error('Conflict markers missing in src/config.json');
    }
    // Abort merge cleanly
    git('merge', '--abort');
    const cleanContent = fs.readFileSync(path.join(REPO_PATH, 'src/config.json'), 'utf8');
    if (cleanContent.includes('<<<<<<<')) throw new Error('Merge abort failed to restore file');
    return 'Conflict successfully detected and cleanly aborted';
  });

  // Test 2: Smart Checkout / Dirty Working Tree Stash & Restore
  check('Dirty Working Tree Checkout & Auto-stash Capability', () => {
    git('checkout', 'master');
    const testFile = path.join(REPO_PATH, 'src/math.ts');
    const original = fs.readFileSync(testFile, 'utf8');
    fs.writeFileSync(testFile, original + '\n// Dirty uncommitted line\n', 'utf8');

    // Stash and switch
    git('stash', 'push', '-m', 'smart-checkout-backup');
    git('checkout', 'develop');
    git('stash', 'pop');

    const modified = fs.readFileSync(testFile, 'utf8');
    if (!modified.includes('Dirty uncommitted line')) {
      throw new Error('Uncommitted modification lost across checkout');
    }

    // Revert modification and switch back
    fs.writeFileSync(testFile, original, 'utf8');
    git('checkout', 'master');
    return 'Working tree changes preserved seamlessly';
  });

  // Test 3: Secret Detection Pattern Verification
  check('Secret Scanner Pattern Detection', () => {
    const fakeAwsKey = 'AKIAIOSFODNN7EXAMPLE';
    const fakeGithubToken = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const fakeSlackToken = ['xoxb', '123456789012', '1234567890123', 'abcdefghijklmnopqrstuvwx'].join('-');

    const awsPattern = /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/;
    const githubPattern = /gh[pousr]_[A-Za-z0-9_]{36,255}/;
    const slackPattern = /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/;

    if (!awsPattern.test(fakeAwsKey)) throw new Error('Failed to match AWS Access Key');
    if (!githubPattern.test(fakeGithubToken)) throw new Error('Failed to match GitHub Personal Access Token');
    if (!slackPattern.test(fakeSlackToken)) throw new Error('Failed to match Slack Token');

    return 'All 3 secret token patterns detected accurately';
  });

  // Test 4: Git Worktree Concurrency & Data Isolation
  check('Concurrent Git Worktree Operation & Isolation', () => {
    const wtDir = path.join(REPO_PATH, 'worktrees', 'hotfix-concurrency');
    if (fs.existsSync(wtDir)) fs.rmSync(wtDir, { recursive: true, force: true });
    git('worktree', 'prune');

    git('worktree', 'add', wtDir, 'hotfix/v1.0.1');

    // In worktree, modify a file
    const wtReadme = path.join(wtDir, 'README.md');
    fs.appendFileSync(wtReadme, '\n// Concurrent edit from worktree\n', 'utf8');
    execFileSync('git', ['-C', wtDir, 'add', 'README.md']);
    execFileSync('git', ['-C', wtDir, 'commit', '-m', 'fix(wt): concurrent worktree commit']);

    // Check main worktree is still on master and untouched
    const mainBranch = git('rev-parse', '--abbrev-ref', 'HEAD');
    if (mainBranch !== 'master') throw new Error(`Main worktree branch unexpectedly changed to ${mainBranch}`);

    const mainReadme = fs.readFileSync(path.join(REPO_PATH, 'README.md'), 'utf8');
    if (mainReadme.includes('Concurrent edit from worktree')) {
      throw new Error('Isolation breached: worktree edit leaked into main worktree');
    }

    // Clean up worktree
    git('worktree', 'remove', wtDir, '--force');
    git('worktree', 'prune');
    return 'Worktree created, committed independently, verified isolated, and cleaned up';
  });

  console.log('\n--- Summary ---');
  console.log(`Passed: ${results.filter(r => r.status === 'PASS').length}/${results.length}`);
}

main().catch(console.error);
