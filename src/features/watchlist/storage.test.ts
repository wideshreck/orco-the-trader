import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  addSymbol,
  clearWatchlist,
  loadWatchlist,
  removeSymbol,
  saveWatchlist,
} from './storage.js';

let tmpHome: string;
let spy: ReturnType<typeof spyOn> | null = null;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'orco-watchlist-'));
  spy = spyOn(os, 'homedir').mockReturnValue(tmpHome);
});

afterEach(() => {
  spy?.mockRestore();
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe('watchlist storage', () => {
  it('returns empty list when no file exists', () => {
    expect(loadWatchlist()).toEqual({ symbols: [] });
  });

  it('adds a symbol (uppercase, dedupes)', () => {
    expect(addSymbol('btcusdt').symbols).toEqual(['BTCUSDT']);
    expect(addSymbol('BTCUSDT').symbols).toEqual(['BTCUSDT']);
    expect(addSymbol('ethusdt').symbols.sort()).toEqual(['BTCUSDT', 'ETHUSDT']);
  });

  it('removes a symbol', () => {
    addSymbol('BTCUSDT');
    addSymbol('ETHUSDT');
    expect(removeSymbol('btcusdt').symbols).toEqual(['ETHUSDT']);
  });

  it('clearWatchlist empties the list', () => {
    addSymbol('BTCUSDT');
    clearWatchlist();
    expect(loadWatchlist().symbols).toEqual([]);
  });

  it('ignores corrupt json and returns empty list', () => {
    const p = path.join(tmpHome, '.config', 'orco', 'watchlist.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'not json', 'utf8');
    expect(loadWatchlist()).toEqual({ symbols: [] });
  });

  it('saveWatchlist persists sorted unique upper-cased symbols', () => {
    saveWatchlist({ symbols: ['solusdt', 'BTCUSDT', 'solusdt', 'ethusdt'] });
    const wl = loadWatchlist();
    expect(wl.symbols).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  });
});
