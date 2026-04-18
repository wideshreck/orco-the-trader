import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CATALOG_URL = 'https://models.dev/api.json';
const TTL_MS = 60 * 60 * 1000;

function cacheDir(): string {
  return path.join(os.homedir(), '.cache', 'orco');
}

function cachePath(): string {
  return path.join(cacheDir(), 'models.json');
}

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

function parseModalities(raw: unknown): ModelModalities | undefined {
  if (!isObject(raw)) return undefined;
  const input = Array.isArray(raw.input)
    ? raw.input.filter((v): v is string => typeof v === 'string')
    : [];
  const output = Array.isArray(raw.output)
    ? raw.output.filter((v): v is string => typeof v === 'string')
    : [];
  return { input, output };
}

function parseCost(raw: unknown): ModelCost | undefined {
  if (!isObject(raw)) return undefined;
  const out: ModelCost = {};
  if (typeof raw.input === 'number') out.input = raw.input;
  if (typeof raw.output === 'number') out.output = raw.output;
  if (typeof raw.cache_read === 'number') out.cache_read = raw.cache_read;
  if (typeof raw.cache_write === 'number') out.cache_write = raw.cache_write;
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseLimit(raw: unknown): ModelLimit | undefined {
  if (!isObject(raw)) return undefined;
  const out: ModelLimit = {};
  if (typeof raw.context === 'number') out.context = raw.context;
  if (typeof raw.output === 'number') out.output = raw.output;
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseModel(raw: unknown): CatalogModel | null {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const out: CatalogModel = { id: raw.id, name: raw.name };
  if (typeof raw.attachment === 'boolean') out.attachment = raw.attachment;
  if (typeof raw.reasoning === 'boolean') out.reasoning = raw.reasoning;
  if (typeof raw.tool_call === 'boolean') out.tool_call = raw.tool_call;
  if (typeof raw.temperature === 'boolean') out.temperature = raw.temperature;
  if (typeof raw.knowledge === 'string') out.knowledge = raw.knowledge;
  if (typeof raw.release_date === 'string') out.release_date = raw.release_date;
  if (typeof raw.open_weights === 'boolean') out.open_weights = raw.open_weights;
  const modalities = parseModalities(raw.modalities);
  if (modalities) out.modalities = modalities;
  const cost = parseCost(raw.cost);
  if (cost) out.cost = cost;
  const limit = parseLimit(raw.limit);
  if (limit) out.limit = limit;
  return out;
}

function parseProvider(raw: unknown): CatalogProvider | null {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || !Array.isArray(raw.env)) {
    return null;
  }
  if (!isObject(raw.models)) return null;
  const env = raw.env.filter((v): v is string => typeof v === 'string');
  const models: Record<string, CatalogModel> = {};
  for (const [k, v] of Object.entries(raw.models)) {
    const m = parseModel(v);
    if (m) models[k] = m;
  }
  const out: CatalogProvider = { id: raw.id, name: raw.name, env, models };
  if (typeof raw.npm === 'string') out.npm = raw.npm;
  if (typeof raw.doc === 'string') out.doc = raw.doc;
  return out;
}

export function parseCatalog(raw: unknown): Catalog {
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
    const raw = JSON.parse(fs.readFileSync(cachePath(), 'utf8')) as unknown;
    if (!isObject(raw)) return null;
    if (typeof raw.fetchedAt !== 'number') return null;
    const data = parseCatalog(raw.data);
    return { fetchedAt: raw.fetchedAt, data };
  } catch {
    return null;
  }
}

function writeCache(data: Catalog): void {
  fs.mkdirSync(cacheDir(), { recursive: true });
  const payload: CacheFile = { fetchedAt: Date.now(), data };
  const file = cachePath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, file);
}

const FETCH_TIMEOUT_MS = 10_000;

async function fetchCatalog(signal?: AbortSignal): Promise<Catalog> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error('catalog fetch timeout')),
    FETCH_TIMEOUT_MS,
  );
  const onOuterAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  try {
    const res = await fetch(CATALOG_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`models.dev ${res.status}`);
    const raw = (await res.json()) as unknown;
    return parseCatalog(raw);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onOuterAbort);
  }
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
