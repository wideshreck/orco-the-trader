import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type Watchlist = { symbols: string[] };

function watchlistPath(): string {
  return path.join(os.homedir(), '.config', 'orco', 'watchlist.json');
}

export function loadWatchlist(): Watchlist {
  try {
    const raw = fs.readFileSync(watchlistPath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return { symbols: [] };
    const syms = (parsed as { symbols?: unknown }).symbols;
    if (!Array.isArray(syms)) return { symbols: [] };
    const clean = syms
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.toUpperCase());
    return { symbols: Array.from(new Set(clean)) };
  } catch {
    return { symbols: [] };
  }
}

export function saveWatchlist(wl: Watchlist): void {
  const p = watchlistPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const unique = Array.from(new Set(wl.symbols.map((s) => s.toUpperCase())));
  fs.writeFileSync(p, JSON.stringify({ symbols: unique.sort() }, null, 2), 'utf8');
}

export function addSymbol(sym: string): Watchlist {
  const wl = loadWatchlist();
  const up = sym.toUpperCase().trim();
  if (!up) return wl;
  if (!wl.symbols.includes(up)) wl.symbols.push(up);
  saveWatchlist(wl);
  return loadWatchlist();
}

export function removeSymbol(sym: string): Watchlist {
  const wl = loadWatchlist();
  const up = sym.toUpperCase().trim();
  wl.symbols = wl.symbols.filter((s) => s !== up);
  saveWatchlist(wl);
  return loadWatchlist();
}

export function clearWatchlist(): void {
  saveWatchlist({ symbols: [] });
}
