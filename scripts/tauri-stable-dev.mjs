import { spawn } from 'node:child_process';
import net from 'node:net';

const pnpmEntry = process.env.npm_execpath;
if (!pnpmEntry) throw new Error('Run this script through pnpm: pnpm tauri:dev:stable');
const previewHost = '127.0.0.1';
const previewPort = 5173;
const children = new Set();
let stopping = false;

function start(args) {
  const child = spawn(process.execPath, [pnpmEntry, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Command exited with ${signal || code}`));
    });
  });
}

function waitForPort(host, port, timeoutMs = 30_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const socket = net.createConnection({ host, port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for http://${host}:${port}`));
        } else {
          setTimeout(probe, 200);
        }
      });
    };
    probe();
  });
}

function stopChildren() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
}

process.once('SIGINT', () => {
  stopChildren();
  process.exitCode = 130;
});
process.once('SIGTERM', () => {
  stopChildren();
  process.exitCode = 143;
});
process.once('exit', stopChildren);

try {
  await waitForExit(start(['build']));
  const preview = start(['exec', 'vite', 'preview', '--host', previewHost, '--port', String(previewPort), '--strictPort']);
  await waitForPort(previewHost, previewPort);

  const config = JSON.stringify({
    build: {
      beforeDevCommand: null,
      devUrl: `http://${previewHost}:${previewPort}`,
    },
  });
  const tauri = start(['tauri', 'dev', '--no-watch', '--no-dev-server-wait', '--config', config]);
  await waitForExit(tauri);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  stopChildren();
}
