import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const token = process.env.GITCODE_TOKEN;
const repository = process.env.GITCODE_REPOSITORY || 'rayskidy/GITBX';
const tag = process.env.GITCODE_RELEASE_TAG;
const releaseName = process.env.GITCODE_RELEASE_NAME || `GITBX ${tag}`;
const bodyFile = process.env.GITCODE_RELEASE_BODY_FILE;
const assetDirectory = process.env.GITCODE_ASSET_DIRECTORY;
const updaterTag = 'gitbx-updater';

if (!token || !tag || !bodyFile || !assetDirectory) {
  throw new Error('GITCODE_TOKEN, GITCODE_RELEASE_TAG, GITCODE_RELEASE_BODY_FILE and GITCODE_ASSET_DIRECTORY are required');
}

const [owner, repo] = repository.split('/');
if (!owner || !repo) throw new Error(`Invalid GitCode repository: ${repository}`);
const apiBase = `https://api.gitcode.com/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
const releaseBody = fs.readFileSync(bodyFile, 'utf8').trim();

function apiUrl(endpoint, query = {}) {
  const url = new URL(`${apiBase}${endpoint}`);
  url.searchParams.set('access_token', token);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url;
}

async function request(endpoint, {
  method = 'GET', body, query, accepted = [200, 201], form = false,
} = {}) {
  const requestBody = form && body
    ? new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)]))
    : body ? JSON.stringify(body) : undefined;
  const response = await fetch(apiUrl(endpoint, query), {
    method,
    headers: body
      ? { Accept: 'application/json', 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }
      : { Accept: 'application/json' },
    body: requestBody,
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!accepted.includes(response.status)) {
    throw new Error(`GitCode API ${method} ${endpoint} returned ${response.status}: ${text.slice(0, 500)}`);
  }
  return { status: response.status, payload };
}

async function findRelease(releaseTag) {
  const response = await fetch(apiUrl(`/releases/tags/${encodeURIComponent(releaseTag)}`), {
    headers: { Accept: 'application/json' },
  });
  if (response.status === 400 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Unable to query GitCode release ${releaseTag}: HTTP ${response.status}`);
  return response.json();
}

async function ensureRelease(releaseTag, name, body, status) {
  const existing = await findRelease(releaseTag);
  if (!existing) {
    return (await request('/releases', {
      method: 'POST',
      form: true,
      body: { tag_name: releaseTag, name, body, target_commitish: 'main', release_status: status },
    })).payload;
  }
  return (await request(`/releases/${encodeURIComponent(releaseTag)}`, {
    method: 'PATCH',
    form: true,
    body: { name, body, release_status: status },
  })).payload;
}

async function deleteExistingAsset(release, releaseTag, fileName) {
  const asset = release?.assets?.find((candidate) => candidate.name === fileName);
  const assetId = asset?.id ?? asset?.attach_file_id;
  if (assetId === undefined) return;
  await request(`/releases/${encodeURIComponent(releaseTag)}/attach_files/${assetId}`, {
    method: 'DELETE',
    accepted: [200, 202, 204],
  });
}

async function uploadAsset(release, releaseTag, filePath, uploadName = path.basename(filePath)) {
  await deleteExistingAsset(release, releaseTag, uploadName);
  const { payload } = await request(`/releases/${encodeURIComponent(releaseTag)}/upload_url`, {
    query: { file_name: uploadName },
  });
  const upload = await fetch(payload.url, {
    method: 'PUT',
    headers: payload.headers,
    body: fs.readFileSync(filePath),
  });
  if (!upload.ok) throw new Error(`GitCode upload failed for ${uploadName}: HTTP ${upload.status}`);
  console.log(`Uploaded ${uploadName}`);
}

async function verifyReleaseAssets(releaseTag, expectedNames) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const release = await findRelease(releaseTag);
    const uploadedNames = new Set((release?.assets ?? []).map((asset) => asset.name));
    const missing = expectedNames.filter((name) => !uploadedNames.has(name));
    if (missing.length === 0) return;
    if (attempt === 5) {
      throw new Error(`GitCode release ${releaseTag} is missing uploaded assets: ${missing.join(', ')}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

function gitCodeAssetUrl(releaseTag, fileName) {
  return `${apiBase}/releases/${encodeURIComponent(releaseTag)}/attach_files/${encodeURIComponent(fileName)}/download`;
}

function rewriteUpdaterUrls(value) {
  if (Array.isArray(value)) return value.map(rewriteUpdaterUrls);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (key === 'url' && typeof child === 'string') {
      const fileName = decodeURIComponent(new URL(child).pathname.split('/').pop());
      return [key, gitCodeAssetUrl(tag, fileName)];
    }
    return [key, rewriteUpdaterUrls(child)];
  }));
}

// Keep the release out of the latest channel until every signed asset and the
// rewritten updater metadata have been uploaded and verified.
let release = await ensureRelease(tag, releaseName, releaseBody, 'pre');
const files = fs.readdirSync(assetDirectory).map((name) => path.join(assetDirectory, name));
const latestJsonPath = files.find((file) => path.basename(file) === 'latest.json');
if (!latestJsonPath) throw new Error('GitHub release did not contain latest.json');

for (const file of files.filter((candidate) => candidate !== latestJsonPath)) {
  await uploadAsset(release, tag, file);
}

const gitCodeMetadata = rewriteUpdaterUrls(JSON.parse(fs.readFileSync(latestJsonPath, 'utf8')));
const rewrittenMetadataPath = path.join(assetDirectory, 'latest.gitcode.json');
fs.writeFileSync(rewrittenMetadataPath, `${JSON.stringify(gitCodeMetadata, null, 2)}\n`);
release = await findRelease(tag);
await uploadAsset(release, tag, rewrittenMetadataPath, 'latest.json');
const expectedVersionAssets = [
  ...files.filter((candidate) => candidate !== latestJsonPath).map((file) => path.basename(file)),
  'latest.json',
];
await verifyReleaseAssets(tag, expectedVersionAssets);

let updaterRelease = await ensureRelease(
  updaterTag,
  'GITBX automatic update metadata',
  'Machine-readable signed update metadata. Use the versioned releases for manual downloads.',
  'pre',
);
updaterRelease = await findRelease(updaterTag) ?? updaterRelease;
await uploadAsset(updaterRelease, updaterTag, rewrittenMetadataPath, 'latest.json');
await verifyReleaseAssets(updaterTag, ['latest.json']);

// Mark the versioned release as latest after updating the metadata pointer.
await ensureRelease(tag, releaseName, releaseBody, 'latest');
console.log(`Published ${tag} to https://gitcode.com/${repository}`);
