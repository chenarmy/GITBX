import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = path.join(root, 'package.json');
const cargoPath = path.join(root, 'Cargo.toml');
const tauriPath = path.join(root, 'src-tauri', 'tauri.conf.json');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const cargoText = fs.readFileSync(cargoPath, 'utf8');
const tauriJson = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
const workspaceVersionMatch = cargoText.match(/\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"/m);

if (!workspaceVersionMatch) throw new Error('Unable to find [workspace.package] version in Cargo.toml');

const versions = {
  package: packageJson.version,
  cargo: workspaceVersionMatch[1],
  tauri: tauriJson.version,
};

if (process.argv.includes('--check')) {
  const uniqueVersions = new Set(Object.values(versions));
  if (uniqueVersions.size !== 1) {
    console.error('Version mismatch:', versions);
    process.exit(1);
  }
  console.log(`Version files are synchronized at ${versions.package}.`);
  process.exit(0);
}

const requestedVersion = process.argv[2]?.replace(/^v/i, '');
if (!requestedVersion || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(requestedVersion)) {
  console.error('Usage: pnpm version:set <major.minor.patch>');
  process.exit(1);
}

packageJson.version = requestedVersion;
tauriJson.version = requestedVersion;
const nextCargoText = cargoText.replace(
  /(\[workspace\.package\][\s\S]*?^version\s*=\s*")[^"]+("\s*$)/m,
  `$1${requestedVersion}$2`,
);

fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
fs.writeFileSync(tauriPath, `${JSON.stringify(tauriJson, null, 2)}\n`);
fs.writeFileSync(cargoPath, nextCargoText);
console.log(`Updated application version to ${requestedVersion}. Run pnpm install and cargo check to refresh lockfiles.`);
