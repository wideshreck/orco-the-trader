import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CATALOG_URL = 'https://models.dev/api.json';
const CACHE_DIR = path.join(os.homedir(), '.cache', 'jarvis');
const CACHE_PATH = path.join(CACHE_DIR, 'models.json');
const TTL_MS = 60 * 60 * 1000;

export type ModelModalities = { input: string[]; output: string[] };
export type ModelCost = {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
};
export type ModelLimit = { context?: number; output?: number };

export type CatalogModel = {
  id: string;
  name: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  temperature?: boolean;
  knowledge?: string;
  modalities?: ModelModalities;
  cost?: ModelCost;
  limit?: ModelLimit;
  release_date?: string;
  open_weights?: boolean;
};

export type CatalogProvider = {
  id: string;
  name: string;
  env: string[];
  npm?: string;
  doc?: string;
  models: Record<string, CatalogModel>;
};

export type Catalog = Record<string, CatalogProvider>;
export type ModelRef = { providerId: string; modelId: string };

type CacheFile = { fetchedAt: number; data: Catalog };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseModel(raw: unknown): CatalogModel | null {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  return raw as unknown as CatalogModel;
}

function parseProvider(raw: unknown): CatalogProvider | null {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || !Array.isArray(raw.env)) {
    return null;
  }
  if (!isObject(raw.models)) return null;
  const models: Record<string, CatalogModel> = {};
  for (const [k, v] of Object.entries(raw.models)) {
    const m = parseModel(v);
    if (m) models[k] = m;
  }
  return { ...(raw as unknown as CatalogProvider), models };
}

function parseCatalog(raw: unknown): Catalog {
  if (!isObject(raw)) throw new Error('catalog: root is not an object');
  const out: Catalog = {};
  for (const [k, v] of Object.entries(raw)) {
    const p = parseProvider(v);
    if (p) out[k] = p;
  }
  return out;
}

function readCache(): CacheFile | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as unknown;
    if (!isObject(raw)) return null;
    if (typeof raw.fetchedAt !== 'number') return null;
    const data = parseCatalog(raw.data);
    return { fetchedAt: raw.fetchedAt, data };
  } catch {
    return null;
  }
}

function writeCache(data: Catalog): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const payload: CacheFile = { fetchedAt: Date.now(), data };
  const tmp = `${CACHE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, CACHE_PATH);
}

async function fetchCatalog(signal?: AbortSignal): Promise<Catalog> {
  const res = await fetch(CATALOG_URL, signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`models.dev ${res.status}`);
  const raw = (await res.json()) as unknown;
  return parseCatalog(raw);
}

export type LoadResult = { catalog: Catalog; stale: boolean; fromCache: boolean };

export async function loadCatalog(
  options: { forceRefresh?: boolean; signal?: AbortSignal } = {},
): Promise<LoadResult> {
  const cache = readCache();
  const fresh = cache !== null && Date.now() - cache.fetchedAt < TTL_MS;

  if (!options.forceRefresh && fresh && cache) {
    return { catalog: cache.data, stale: false, fromCache: true };
  }

  try {
    const data = await fetchCatalog(options.signal);
    writeCache(data);
    return { catalog: data, stale: false, fromCache: false };
  } catch (err) {
    if (cache) return { catalog: cache.data, stale: true, fromCache: true };
    throw err;
  }
}

export function findModel(catalog: Catalog, ref: ModelRef): CatalogModel | undefined {
  return catalog[ref.providerId]?.models[ref.modelId];
}

export function listAllModels(
  catalog: Catalog,
): Array<{ provider: CatalogProvider; model: CatalogModel }> {
  const out: Array<{ provider: CatalogProvider; model: CatalogModel }> = [];
  for (const provider of Object.values(catalog)) {
    for (const model of Object.values(provider.models)) {
      out.push({ provider, model });
    }
  }
  return out;
}
