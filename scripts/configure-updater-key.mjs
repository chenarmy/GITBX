import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const publicKey = process.env.TAURI_UPDATER_PUBLIC_KEY?.trim();

if (!publicKey) {
  throw new Error('TAURI_UPDATER_PUBLIC_KEY is required for release builds. Configure it as a GitHub Actions variable.');
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.plugins ??= {};
config.plugins.updater ??= {};
config.plugins.updater.pubkey = publicKey;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log('Configured the updater public key for this release build.');
