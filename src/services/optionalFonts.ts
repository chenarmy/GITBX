import {
  OPTIONAL_FONT_PACKS,
  type OptionalFontFaceDefinition,
  type OptionalFontPackDefinition,
} from '@/services/optionalFontManifest.generated';

const CACHE_DATABASE = 'gitbx-font-cache';
const CACHE_STORE = 'font-files';
const CACHE_VERSION = 1;
const DOWNLOAD_CONCURRENCY = 6;
const REMOTE_BASE_URLS = [
  'https://raw.githubusercontent.com/chenarmy/GITBX/main/font-packs',
  'https://cdn.jsdelivr.net/gh/chenarmy/GITBX@main/font-packs',
];

interface CachedFontFile {
  file: string;
  sha256: string;
  bytes: ArrayBuffer;
}

const loadedPacks = new Set<string>();
const loadingPacks = new Map<string, Promise<boolean>>();
let databasePromise: Promise<IDBDatabase | null> | null = null;

function openCacheDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(CACHE_DATABASE, CACHE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CACHE_STORE)) {
        database.createObjectStore(CACHE_STORE, { keyPath: 'file' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return databasePromise;
}

async function readCachedFile(face: OptionalFontFaceDefinition): Promise<ArrayBuffer | null> {
  const database = await openCacheDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    const request = database.transaction(CACHE_STORE, 'readonly').objectStore(CACHE_STORE).get(face.file);
    request.onsuccess = () => {
      const cached = request.result as CachedFontFile | undefined;
      if (cached?.sha256 === face.sha256 && cached.bytes?.byteLength === face.size) {
        resolve(cached.bytes);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => resolve(null);
  });
}

async function writeCachedFile(face: OptionalFontFaceDefinition, bytes: ArrayBuffer): Promise<void> {
  const database = await openCacheDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(CACHE_STORE, 'readwrite');
    transaction.objectStore(CACHE_STORE).put({ file: face.file, sha256: face.sha256, bytes } satisfies CachedFontFile);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

function encodedFilePath(file: string): string {
  return file.split('/').map(encodeURIComponent).join('/');
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isWoff2(bytes: ArrayBuffer): boolean {
  const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4));
  return header.length === 4
    && header[0] === 0x77 && header[1] === 0x4f && header[2] === 0x46 && header[3] === 0x32;
}

async function fetchFontFile(face: OptionalFontFaceDefinition): Promise<ArrayBuffer> {
  const cached = await readCachedFile(face);
  if (cached) return cached;

  let lastError: unknown;
  const isLocalDevelopment = typeof location !== 'undefined'
    && (location.hostname === '127.0.0.1' || location.hostname === 'localhost');
  const developmentBase = isLocalDevelopment ? [`${location.origin}/font-packs`] : [];
  for (const base of [...developmentBase, ...REMOTE_BASE_URLS]) {
    try {
      const response = await fetch(`${base}/${encodedFilePath(face.file)}`, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== face.size || !isWoff2(bytes)) throw new Error('Invalid WOFF2 payload');
      if (await sha256(bytes) !== face.sha256) throw new Error('Font checksum mismatch');
      await writeCachedFile(face, bytes);
      return bytes;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Unable to download ${face.file}`);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  worker: (value: T) => Promise<R>,
  concurrency = DOWNLOAD_CONCURRENCY,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await worker(values[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function registerPack(pack: OptionalFontPackDefinition, buffers: ArrayBuffer[]): Promise<void> {
  const faces = pack.faces.map((definition, index) => new FontFace(pack.family, buffers[index], {
    style: definition.style,
    weight: definition.weight,
    unicodeRange: definition.unicodeRange,
    display: 'swap',
  }));
  try {
    for (const face of faces) document.fonts.add(face);
    await Promise.all(faces.map((face) => face.load()));
  } catch (error) {
    for (const face of faces) document.fonts.delete(face);
    throw error;
  }
}

async function loadPack(id: string): Promise<boolean> {
  const pack = OPTIONAL_FONT_PACKS[id];
  if (!pack || typeof document === 'undefined' || typeof FontFace === 'undefined') return false;
  try {
    const uniqueFaces = [...new Map(pack.faces.map((face) => [face.file, face])).values()];
    const uniqueBuffers = await mapWithConcurrency(uniqueFaces, fetchFontFile);
    const buffersByFile = new Map(uniqueFaces.map((face, index) => [face.file, uniqueBuffers[index]]));
    const buffers = pack.faces.map((face) => buffersByFile.get(face.file) as ArrayBuffer);
    await registerPack(pack, buffers);
    loadedPacks.add(id);
    return true;
  } catch (error) {
    console.warn(`[fonts] Optional font pack ${id} is unavailable; using system fallback.`, error);
    return false;
  }
}

export function isOptionalFont(id: string): boolean {
  return Boolean(OPTIONAL_FONT_PACKS[id]);
}

export function optionalFontDownloadSize(id: string): number | null {
  return OPTIONAL_FONT_PACKS[id]?.totalBytes ?? null;
}

/** Download, verify, persist and register an optional font pack. */
export function ensureOptionalFontLoaded(id: string): Promise<boolean> {
  if (loadedPacks.has(id)) return Promise.resolve(true);
  const active = loadingPacks.get(id);
  if (active) return active;
  const request = loadPack(id).finally(() => loadingPacks.delete(id));
  loadingPacks.set(id, request);
  return request;
}
