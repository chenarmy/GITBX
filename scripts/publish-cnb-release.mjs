import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const token = process.env.CNB_TOKEN;
const repository = process.env.CNB_REPOSITORY || 'chenarmy/GITBX';
const tag = process.env.CNB_RELEASE_TAG;
const releaseName = process.env.CNB_RELEASE_NAME || `GITBX ${tag}`;
const bodyFile = process.env.CNB_RELEASE_BODY_FILE;
const assetDirectory = process.env.CNB_ASSET_DIRECTORY;
const image = 'docker.cnb.cool/looc/git-cnb:latest';

if (!token || !tag || !bodyFile || !assetDirectory) {
  throw new Error('CNB_TOKEN, CNB_RELEASE_TAG, CNB_RELEASE_BODY_FILE and CNB_ASSET_DIRECTORY are required');
}

const cwd = process.cwd();
const mount = `${cwd}:/work`;
const docker = (...args) => execFileSync('docker', [
  'run', '--rm', '-e', 'CNB_TOKEN', '-v', mount, '-w', '/work', image,
  'git-cnb', '--repo', repository, ...args,
], { env: { ...process.env, CNB_TOKEN: token }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function tryGetRelease() {
  try {
    return docker('release', 'get', '--tag', tag);
  } catch {
    return null;
  }
}

if (!tryGetRelease()) {
  const body = await readFile(path.resolve(bodyFile), 'utf8');
  docker('release', 'create', '--tag', tag, '--name', releaseName, '--body', body, '--make-latest=true');
}

const files = (await readdir(path.resolve(assetDirectory)))
  .filter((name) => name !== 'latest.json')
  .sort()
  .map((name) => path.join(assetDirectory, name));

const latestPath = path.join(assetDirectory, 'latest.json');
const latest = JSON.parse(await readFile(path.resolve(latestPath), 'utf8'));
const cnbBase = `https://cnb.cool/${repository}/-/releases/download/${tag}`;
const rewrite = (value) => typeof value === 'string'
  ? value.replace(/https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/([^/?#]+)/g, `${cnbBase}/$1`)
  : value;
const rewriteObject = (value) => Array.isArray(value)
  ? value.map(rewriteObject)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteObject(item)]))
    : rewrite(value);
await writeFile(path.resolve(latestPath), `${JSON.stringify(rewriteObject(latest), null, 2)}\n`);
files.push(latestPath);

const uploadArgs = ['release', 'asset-upload', '--tag-name', tag];
for (const file of files) uploadArgs.push('--file-name', file);
docker(...uploadArgs);

const result = docker('release', 'get', '--tag', tag);
const match = result.match(/Assets \((\d+)\):/);
const count = match ? Number(match[1]) : NaN;
if (count !== 12) throw new Error(`CNB release ${tag} has ${Number.isNaN(count) ? 'an unknown number of' : count} assets; expected exactly 12.`);

console.log(`Published ${tag} to https://cnb.cool/${repository} with 12 verified assets.`);
