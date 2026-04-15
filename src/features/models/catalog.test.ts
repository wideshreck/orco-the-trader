import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findModel, listAllModels, loadCatalog, parseCatalog } from './catalog.js';

let tmpHome: string;
let homeSpy: ReturnType<typeof spyOn> | null = null;
let fetchSpy: ReturnType<typeof spyOn> | null = null;

function cachePath(): string {
  return path.join(tmpHome, '.cache', 'orco', 'models.json');
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'orco-catalog-'));
  homeSpy = spyOn(os, 'homedir').mockReturnValue(tmpHome);
});

afterEach(() => {
  homeSpy?.mockRestore();
  fetchSpy?.mockRestore();
  fetchSpy = null;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

const sampleRaw = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    env: ['ANTHROPIC_API_KEY'],
    models: {
      sonnet: { id: 'sonnet', name: 'Sonnet' },
      halfbroken: { id: 'halfbroken' }, // missing name — should drop
    },
  },
  invalid: 'not an object',
  missingEnv: { id: 'x', name: 'X', models: {} },
};

describe('parseCatalog', () => {
  it('keeps providers with required fields and valid models', () => {
    const cat = parseCatalog(sampleRaw);
    expect(Object.keys(cat)).toEqual(['anthropic']);
    expect(Object.keys(cat.anthropic?.models ?? {})).toEqual(['sonnet']);
  });

  it('returns empty object for non-object input', () => {
    expect(() => parseCatalog('bogus')).toThrow(/root is not an object/);
  });

  it('returns empty catalog for empty input', () => {
    expect(parseCatalog({})).toEqual({});
  });
});

describe('findModel', () => {
  it('returns the model when both ids match', () => {
    const cat = parseCatalog(sampleRaw);
    const m = findModel(cat, { providerId: 'anthropic', modelId: 'sonnet' });
    expect(m?.id).toBe('sonnet');
  });

  it('returns undefined for unknown provider', () => {
    const cat = parseCatalog(sampleRaw);
    expect(findModel(cat, { providerId: 'ghost', modelId: 'x' })).toBeUndefined();
  });
});

describe('listAllModels', () => {
  it('yields one entry per model across all providers', () => {
    const cat = parseCatalog(sampleRaw);
    const all = listAllModels(cat);
    expect(all).toHaveLength(1);
    expect(all[0]?.model.id).toBe('sonnet');
  });
});

describe('loadCatalog', () => {
  function mockFetch(body: unknown, ok = true): void {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok,
        status: ok ? 200 : 500,
        json: async () => body,
      } as Response;
    });
  }

  it('fetches and caches on first call', async () => {
    mockFetch(sampleRaw);
    const { catalog, stale, fromCache } = await loadCatalog();
    expect(Object.keys(catalog)).toEqual(['anthropic']);
    expect(stale).toBe(false);
    expect(fromCache).toBe(false);
    expect(fs.existsSync(cachePath())).toBe(true);
  });

  it('uses cache when fresh (no fetch call)', async () => {
    mockFetch(sampleRaw);
    await loadCatalog();
    const firstCallCount = fetchSpy?.mock.calls.length ?? 0;
    const second = await loadCatalog();
    expect(second.fromCache).toBe(true);
    expect(fetchSpy?.mock.calls.length).toBe(firstCallCount);
  });

  it('falls back to stale cache when fetch fails', async () => {
    // Seed cache file with old timestamp
    fs.mkdirSync(path.dirname(cachePath()), { recursive: true });
    fs.writeFileSync(
      cachePath(),
      JSON.stringify({ fetchedAt: Date.now() - 10 * 60 * 60 * 1000, data: sampleRaw }),
    );
    fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const { stale, fromCache } = await loadCatalog();
    expect(stale).toBe(true);
    expect(fromCache).toBe(true);
  });

  it('throws when there is no cache and fetch fails', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(loadCatalog()).rejects.toThrow(/offline/);
  });

  it('forceRefresh bypasses a fresh cache', async () => {
    mockFetch(sampleRaw);
    await loadCatalog();
    const firstCallCount = fetchSpy?.mock.calls.length ?? 0;
    await loadCatalog({ forceRefresh: true });
    expect(fetchSpy?.mock.calls.length).toBe(firstCallCount + 1);
  });
});
