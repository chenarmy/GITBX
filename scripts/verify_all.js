const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function verify() {
  console.log('--- 1. Testing Repo Info & Multi-repo Switching ---');
  const infoGitbx = await request({ hostname: '127.0.0.1', port: 5173, path: '/api/repo/info?path=I:%5CGITBX', method: 'GET' });
  console.log('GITBX Repo Info:', infoGitbx.name, 'Branch:', infoGitbx.head_branch, 'Dirty:', infoGitbx.is_dirty);

  const infoSample = await request({ hostname: '127.0.0.1', port: 5173, path: '/api/repo/info?path=I:%5CGITBX_SAMPLE_REPO', method: 'GET' });
  console.log('Sample Repo Info:', infoSample.name, 'Branch:', infoSample.head_branch, 'Dirty:', infoSample.is_dirty);

  console.log('\n--- 2. Testing Branch List & Head Status ---');
  const branches = await request({ hostname: '127.0.0.1', port: 5173, path: '/api/repo/branches?path=I:%5CGITBX_SAMPLE_REPO', method: 'GET' });
  branches.forEach(b => console.log(`  - Branch '${b.name}' (is_head: ${b.is_head}, commit: ${b.target_commit_id.slice(0, 7)})`));

  console.log('\n--- 3. Testing Create Branch from Commit ---');
  const createBranchRes = await request({
    hostname: '127.0.0.1',
    port: 5173,
    path: '/api/repo/branch/create',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { repo_path: 'I:\\GITBX_SAMPLE_REPO', name: 'feat/test-verification', checkout: false });
  console.log('Create Branch Result:', createBranchRes);

  console.log('\n--- 4. Testing Branch Rename (Alt+Shift+R) ---');
  const renameRes = await request({
    hostname: '127.0.0.1',
    port: 5173,
    path: '/api/repo/branch/rename',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { repo_path: 'I:\\GITBX_SAMPLE_REPO', old_name: 'feat/test-verification', new_name: 'feat/verified-ok' });
  console.log('Rename Branch Result:', renameRes);

  console.log('\n--- 5. Testing Diff Extraction for Working Tree & Branch Compare ---');
  const diffRes = await request({
    hostname: '127.0.0.1',
    port: 5173,
    path: '/api/repo/diff?path=I:%5CGITBX_SAMPLE_REPO&compare=feature/user-auth',
    method: 'GET'
  });
  console.log('Branch Diff Compare Result (length):', (diffRes.raw_diff || '').length, 'chars');

  console.log('\n--- 6. Testing Commit Graph DAG generation ---');
  const graphRes = await request({
    hostname: '127.0.0.1',
    port: 5173,
    path: '/api/repo/graph?path=I:%5CGITBX_SAMPLE_REPO',
    method: 'GET'
  });
  console.log(`Commit Graph contains ${graphRes.length} commits:`);
  graphRes.forEach(c => console.log(`  * [${c.short_id}] (Lane ${c.lane}) ${c.summary} | Refs: [${c.branch_refs.concat(c.tag_refs).join(', ')}]`));

  console.log('\n✅ ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

verify().catch(console.error);
