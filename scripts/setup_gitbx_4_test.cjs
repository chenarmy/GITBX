/**
 * Setup Script for gitbx-4-test Repository
 * 
 * Automatically initializes I:\gitbx-4-test with realistic project files,
 * commit histories, branches, conflict scenarios, tags, and worktree.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_PATH = path.resolve('I:\\gitbx-4-test');

function git(...args) {
  return execFileSync('git', ['-C', REPO_PATH, ...args], { encoding: 'utf8' }).trim();
}

function writeFile(relPath, content) {
  const fullPath = path.join(REPO_PATH, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

function appendFile(relPath, content) {
  const fullPath = path.join(REPO_PATH, relPath);
  fs.appendFileSync(fullPath, content, 'utf8');
}

async function main() {
  console.log(`Setting up test repository at: ${REPO_PATH}`);

  if (!fs.existsSync(REPO_PATH)) {
    fs.mkdirSync(REPO_PATH, { recursive: true });
    execFileSync('git', ['init', REPO_PATH]);
  }

  // Set local test committer identity
  git('config', 'user.name', 'GITBX Tester');
  git('config', 'user.email', 'tester@gitbx.local');

  // Check if repository already has commits
  let hasCommits = false;
  try {
    git('rev-parse', 'HEAD');
    hasCommits = true;
  } catch {
    hasCommits = false;
  }

  if (!hasCommits) {
    console.log('1. Creating baseline commit on master...');
    writeFile('README.md', '# GITBX Test Repository\n\nThis repository is used for comprehensive testing of all GITBX features.\n');
    writeFile('package.json', JSON.stringify({
      name: 'gitbx-4-test',
      version: '1.0.0',
      description: 'Comprehensive test fixture for GITBX',
      main: 'src/index.ts',
      scripts: { test: 'echo "running tests"' }
    }, null, 2) + '\n');
    writeFile('src/index.ts', 'export function greeting(name: string): string {\n  return `Hello, ${name}! Welcome to GITBX.`;\n}\n');
    writeFile('src/math.ts', 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
    writeFile('src/config.json', JSON.stringify({
      appName: 'gitbx-test-app',
      environment: 'development',
      port: 3000,
      debug: true
    }, null, 2) + '\n');
    writeFile('.gitignore', 'node_modules/\ndist/\n*.log\nworktrees/\n');

    git('add', '.');
    git('commit', '-m', 'chore: initial baseline commit with core project structure');
    git('tag', 'v0.1.0', '-m', 'Initial baseline release v0.1.0');
  }

  console.log('2. Creating develop branch and feature commits...');
  try { git('checkout', 'master'); } catch {}
  try { git('checkout', '-B', 'develop'); } catch {}

  writeFile('src/utils.ts', 'export function sleep(ms: number): Promise<void> {\n  return new Promise((resolve) => setTimeout(resolve, ms));\n}\n');
  git('add', 'src/utils.ts');
  git('commit', '-m', 'feat(utils): add asynchronous sleep utility');

  console.log('3. Creating feature branches...');
  // Feature branch: feat/user-auth
  git('checkout', '-B', 'feat/user-auth', 'develop');
  writeFile('src/auth.ts', 'export interface User {\n  id: string;\n  name: string;\n}\n\nexport function login(user: User): boolean {\n  return user.id.length > 0;\n}\n');
  git('add', 'src/auth.ts');
  git('commit', '-m', 'feat(auth): add login authentication interface');

  // Feature branch: feat/payment
  git('checkout', '-B', 'feat/payment', 'develop');
  writeFile('src/payment.ts', 'export function processPayment(amount: number): boolean {\n  return amount > 0;\n}\n');
  git('add', 'src/payment.ts');
  git('commit', '-m', 'feat(payment): add basic payment processing logic');

  console.log('4. Creating conflict branches for 3-way merge conflict testing...');
  // Conflict base
  git('checkout', '-B', 'conflict/base', 'master');
  writeFile('src/config.json', JSON.stringify({
    appName: 'gitbx-test-app',
    environment: 'development',
    port: 3000,
    theme: 'system'
  }, null, 2) + '\n');
  git('add', 'src/config.json');
  git('commit', '-m', 'chore(config): baseline configuration for conflict test');

  // Conflict Branch A (Ours)
  git('checkout', '-B', 'conflict/branch-a', 'conflict/base');
  writeFile('src/config.json', JSON.stringify({
    appName: 'gitbx-test-app-pro',
    environment: 'production',
    port: 8080,
    theme: 'dark'
  }, null, 2) + '\n');
  git('add', 'src/config.json');
  git('commit', '-m', 'refactor(config): update port to 8080 and theme to dark (branch A)');

  // Conflict Branch B (Theirs)
  git('checkout', '-B', 'conflict/branch-b', 'conflict/base');
  writeFile('src/config.json', JSON.stringify({
    appName: 'gitbx-test-app-enterprise',
    environment: 'staging',
    port: 9000,
    theme: 'light'
  }, null, 2) + '\n');
  git('add', 'src/config.json');
  git('commit', '-m', 'refactor(config): update port to 9000 and theme to light (branch B)');

  console.log('5. Creating hotfix branch for worktree testing...');
  git('checkout', '-B', 'hotfix/v1.0.1', 'master');
  appendFile('README.md', '\n## Hotfix Notice\nPatch applied for critical bug.\n');
  git('add', 'README.md');
  git('commit', '-m', 'fix: apply critical documentation hotfix');

  console.log('6. Creating tags...');
  try { git('tag', '-d', 'v1.0.0-beta'); } catch {}
  git('tag', '-a', 'v1.0.0-beta', 'develop', '-m', 'Beta release on develop branch');

  console.log('7. Switching back to master...');
  git('checkout', 'master');

  console.log('\n--- Setup Summary ---');
  console.log('Branches created:');
  console.log(git('branch', '-a'));
  console.log('\nTags created:');
  console.log(git('tag', '-l'));
  console.log('\nLast 5 commits on master:');
  console.log(git('log', '--oneline', '-n', '5'));
  console.log('\ngitbx-4-test is successfully prepared for testing!');
}

main().catch((err) => {
  console.error('Failed to setup test repository:', err);
  process.exit(1);
});
