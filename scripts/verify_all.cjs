const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

async function verify() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gitbx-verify-'));
  try {
    git(repo, 'init');
    git(repo, 'config', 'user.name', 'GITBX Verification');
    git(repo, 'config', 'user.email', 'verify@gitbx.local');
    fs.writeFileSync(path.join(repo, 'README.md'), '# GITBX\n');
    git(repo, 'add', 'README.md');
    git(repo, 'commit', '-m', 'initial');

    const base = { hostname: '127.0.0.1', port: 8080 };
    const info = await request({ ...base, path: `/api/repo/info?path=${encodeURIComponent(repo)}`, method: 'GET' });
    if (info.status !== 200 || !info.body.name) throw new Error(`repo info failed: ${JSON.stringify(info)}`);

    const branch = await request({ ...base, path: '/api/repo/branch/create', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {
      repo_path: repo, name: 'feat/verification', checkout: false,
    });
    if (branch.status !== 200) throw new Error(`branch create failed: ${JSON.stringify(branch)}`);

    const status = await request({ ...base, path: `/api/repo/status?path=${encodeURIComponent(repo)}`, method: 'GET' });
    if (status.status !== 200 || !Array.isArray(status.body.staged_files)) throw new Error(`status failed: ${JSON.stringify(status)}`);

    console.log('GITBX verification passed:', repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

verify().catch((error) => { console.error(error); process.exitCode = 1; });
