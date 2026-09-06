const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// The Web API now defaults to fail-closed authentication (H1 fix): every
// non-health endpoint requires `Authorization: Bearer <token>` when
// GITBX_WEB_TOKEN is configured. This script reads the same env vars the
// server uses so it keeps working against a token-protected instance.
const PORT = parseInt(process.env.GITBX_WEB_PORT || '8080', 10);
const TOKEN = process.env.GITBX_WEB_TOKEN || '';

function request(options, data) {
  return new Promise((resolve, reject) => {
    const headers = { ...(options.headers || {}) };
    if (data) headers['Content-Type'] = 'application/json';
    if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
    const req = http.request({ ...options, headers }, (res) => {
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

// Create the scratch repo inside the first allowlisted root when one is
// configured, so the repository allowlist check passes; otherwise fall back
// to the OS temp directory (allowlist disabled).
function scratchRoot() {
  const roots = (process.env.GITBX_ALLOWED_REPOS || '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (roots.length === 0) return os.tmpdir();
  fs.mkdirSync(roots[0], { recursive: true });
  return roots[0];
}

async function verify() {
  if (!TOKEN) {
    console.warn('GITBX_WEB_TOKEN is not set — requests will be sent without a bearer token.');
    console.warn('This only works if the server was started without GITBX_WEB_TOKEN (local dev).');
  }

  const repo = fs.mkdtempSync(path.join(scratchRoot(), 'gitbx-verify-'));
  try {
    git(repo, 'init');
    git(repo, 'config', 'user.name', 'GITBX Verification');
    git(repo, 'config', 'user.email', 'verify@gitbx.local');
    fs.writeFileSync(path.join(repo, 'README.md'), '# GITBX\n');
    git(repo, 'add', 'README.md');
    git(repo, 'commit', '-m', 'initial');

    const base = { hostname: '127.0.0.1', port: PORT };
    const info = await request({ ...base, path: `/api/repo/info?path=${encodeURIComponent(repo)}`, method: 'GET' });
    if (info.status !== 200 || !info.body.name) throw new Error(`repo info failed: ${JSON.stringify(info)}`);

    const branch = await request({ ...base, path: '/api/repo/branch/create', method: 'POST' }, {
      repo_path: repo, name: 'feat/verification', checkout: false,
    });
    if (branch.status !== 200) throw new Error(`branch create failed: ${JSON.stringify(branch)}`);

    const status = await request({ ...base, path: `/api/repo/status?path=${encodeURIComponent(repo)}`, method: 'GET' });
    if (status.status !== 200 || !Array.isArray(status.body.staged_files)) throw new Error(`status failed: ${JSON.stringify(status)}`);

    console.log(`GITBX verification passed (port ${PORT}):`, repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

verify().catch((error) => { console.error(error); process.exitCode = 1; });
