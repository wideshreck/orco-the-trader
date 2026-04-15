import { z } from 'zod';
import { defineTool } from '../../tools/define.js';
import type { Candle } from './get-ohlcv.js';
import { rsi, sma } from './indicators.js';

const INTERVALS = ['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'] as const;

type Raw24h = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

type Row = {
  symbol: string;
  last: number;
  pct24h: number;
  quoteVolume: number;
  rsi14: number | null;
  // Close vs SMA20 as a % — positive = price above mean.
  smaDeviationPct: number | null;
  // Change over the scan interval's lookback window, in %.
  intervalChangePct: number | null;
};

async function fetchTicker(symbol: string, signal: AbortSignal): Promise<Raw24h | null> {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`,
      { signal },
    );
    if (!res.ok) return null;
    return (await res.json()) as Raw24h;
  } catch {
    return null;
  }
}

async function fetchCandles(
  symbol: string,
  interval: string,
  limit: number,
  signal: AbortSignal,
): Promise<Candle[]> {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`,
      { signal },
    );
    if (!res.ok) return [];
    const raw = (await res.json()) as unknown[];
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
  } catch {
    return [];
  }
}

async function scanOne(symbol: string, interval: string, signal: AbortSignal): Promise<Row> {
  const [ticker, candles] = await Promise.all([
    fetchTicker(symbol, signal),
    fetchCandles(symbol, interval, 50, signal),
  ]);
  const last = ticker ? Number(ticker.lastPrice) : (candles[candles.length - 1]?.c ?? Number.NaN);
  const pct24h = ticker ? Number(ticker.priceChangePercent) : Number.NaN;
  const quoteVolume = ticker ? Number(ticker.quoteVolume) : Number.NaN;
  const rsi14 = rsi(candles, 14);
  const sma20 = sma(candles, 20);
  const smaDeviationPct = sma20 && Number.isFinite(last) ? ((last - sma20) / sma20) * 100 : null;
  const first = candles[0]?.c;
  const intervalChangePct =
    first && Number.isFinite(last) && first !== 0 ? ((last - first) / first) * 100 : null;
  return { symbol, last, pct24h, quoteVolume, rsi14, smaDeviationPct, intervalChangePct };
}

export const scanMarket = defineTool({
  name: 'scan_market',
  description: [
    'Scan a set of Binance spot symbols in parallel and return a momentum',
    'digest per symbol: last, 24h %, 24h quote volume, RSI(14) on the given',
    'interval, close vs SMA(20) deviation %, and interval-window change %.',
    '',
    'Use after `list_top_symbols` to filter/rank a candidate set, or with an',
    'explicit symbol list from the user. Interval: 5m 15m 30m 1h 2h 4h 6h',
    '12h 1d.',
    '',
    'Up to 20 symbols per call. Each symbol issues 2 requests; one failed',
    'symbol does not fail the batch — the row returns NaN/null where data',
    'is missing.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe('Binance spot pairs, uppercase (e.g. BTCUSDT)'),
    interval: z.enum(INTERVALS),
    sortBy: z
      .enum(['rsi', 'pct24h', 'quoteVolume', 'intervalChange', 'smaDeviation'])
      .optional()
      .describe('Default pct24h'),
    order: z.enum(['asc', 'desc']).optional().describe('Default desc'),
  }),
  async execute(input, ctx) {
    const interval = input.interval;
    const order = input.order ?? 'desc';
    const sortBy = input.sortBy ?? 'pct24h';
    const syms = input.symbols.map((s) => s.toUpperCase());
    const rows = await Promise.all(syms.map((s) => scanOne(s, interval, ctx.abortSignal)));
    const key: (r: Row) => number = (() => {
      switch (sortBy) {
        case 'rsi':
          return (r) => r.rsi14 ?? Number.NaN;
        case 'quoteVolume':
          return (r) => r.quoteVolume;
        case 'intervalChange':
          return (r) => r.intervalChangePct ?? Number.NaN;
        case 'smaDeviation':
          return (r) => r.smaDeviationPct ?? Number.NaN;
        default:
          return (r) => r.pct24h;
      }
    })();
    rows.sort((a, b) => {
      const av = key(a);
      const bv = key(b);
      const an = Number.isFinite(av);
      const bn = Number.isFinite(bv);
      if (!an && !bn) return 0;
      if (!an) return 1;
      if (!bn) return -1;
      return order === 'asc' ? av - bv : bv - av;
    });
    return { interval, sortBy, order, count: rows.length, rows };
  },
});
