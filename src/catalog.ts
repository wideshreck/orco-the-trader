import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CATALOG_URL = 'https://models.dev/api.json';
const CACHE_DIR = path.join(os.homedir(), '.cache', 'jarvis');
const CACHE_PATH = path.join(CACHE_DIR, 'models.json');
const TTL_MS = 60 * 60 * 1000;

export type ModelModalities = {
  input: string[];
  output: string[];
};

export type ModelCost = {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
};

export type ModelLimit = {
  context?: number;
  output?: number;
};

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

type CacheFile = {
  fetchedAt: number;
  data: Catalog;
};

function readCache(): CacheFile | null {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    return JSON.parse(raw) as CacheFile;
  } catch {
    return null;
  }
}

function writeCache(data: Catalog): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const payload: CacheFile = { fetchedAt: Date.now(), data };
  fs.writeFileSync(CACHE_PATH, JSON.stringify(payload));
}

async function fetchCatalog(signal?: AbortSignal): Promise<Catalog> {
  const res = await fetch(CATALOG_URL, { signal });
  if (!res.ok) throw new Error(`models.dev ${res.status}`);
  return (await res.json()) as Catalog;
}

export async function loadCatalog(
  options: { forceRefresh?: boolean; signal?: AbortSignal } = {},
): Promise<{ catalog: Catalog; stale: boolean; fromCache: boolean }> {
  const cache = readCache();
  const fresh = cache && Date.now() - cache.fetchedAt < TTL_MS;

  if (!options.forceRefresh && fresh && cache) {
    return { catalog: cache.data, stale: false, fromCache: true };
  }

  try {
    const data = await fetchCatalog(options.signal);
    writeCache(data);
    return { catalog: data, stale: false, fromCache: false };
  } catch (err) {
    if (cache) {
      return { catalog: cache.data, stale: true, fromCache: true };
    }
    throw err;
  }
}

export type ModelRef = {
  providerId: string;
  modelId: string;
};

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
