export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export const INTERVALS = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '12h',
  '1d',
  '1w',
] as const;
export type Interval = (typeof INTERVALS)[number];

export function parseKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  const out: Candle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const t = Number(row[0]);
    const o = Number(row[1]);
    const h = Number(row[2]);
    const l = Number(row[3]);
    const c = Number(row[4]);
    const v = Number(row[5]);
    if (!Number.isFinite(t + o + h + l + c + v)) continue;
    out.push({ t, o, h, l, c, v });
  }
  return out;
}

// Shared Binance klines fetch. get_ohlcv exposes this via its tool surface;
// correlate_assets / seasonality / anything else needing raw candles reuses
// it without going through the LLM.
export async function fetchKlines(opts: {
  symbol: string;
  interval: Interval;
  limit: number;
  signal?: AbortSignal;
}): Promise<Candle[]> {
  const symbol = opts.symbol.toUpperCase();
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${opts.interval}&limit=${opts.limit}`;
  const res = await fetch(url, opts.signal ? { signal: opts.signal } : undefined);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`binance ${res.status} for ${symbol}: ${body.slice(0, 200)}`);
  }
  const raw = (await res.json()) as unknown;
  return parseKlines(raw);
}
