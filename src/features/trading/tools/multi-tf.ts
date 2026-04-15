import { z } from 'zod';
import { defineTool } from '../../tools/define.js';
import type { Candle } from './get-ohlcv.js';
import { adx, macd, rsi, sma } from './indicators.js';

const INTERVALS = ['15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w'] as const;
type Interval = (typeof INTERVALS)[number];

type Bias = 'bullish' | 'bearish' | 'neutral';

type Row = {
  interval: Interval;
  candles: number;
  last: number;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  macdHist: number | null;
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  trend: Bias; // from MAs
  momentum: Bias; // from RSI + MACD histogram
  strength: Bias; // from ADX / +DI vs -DI
  overall: Bias; // majority of the three
};

async function fetchCandles(
  symbol: string,
  interval: Interval,
  limit: number,
  signal: AbortSignal,
): Promise<Candle[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { signal });
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
}

function trendBias(last: number, s20: number | null, s50: number | null): Bias {
  if (s20 === null || s50 === null) return 'neutral';
  if (last > s20 && s20 > s50) return 'bullish';
  if (last < s20 && s20 < s50) return 'bearish';
  return 'neutral';
}

function momentumBias(r: number | null, hist: number | null): Bias {
  const rs: Bias = r === null ? 'neutral' : r > 55 ? 'bullish' : r < 45 ? 'bearish' : 'neutral';
  const ms: Bias =
    hist === null ? 'neutral' : hist > 0 ? 'bullish' : hist < 0 ? 'bearish' : 'neutral';
  if (rs === ms) return rs;
  if (rs === 'neutral') return ms;
  if (ms === 'neutral') return rs;
  return 'neutral';
}

function strengthBias(adxVal: number | null, plus: number | null, minus: number | null): Bias {
  if (adxVal === null || plus === null || minus === null) return 'neutral';
  if (adxVal < 20) return 'neutral';
  if (plus > minus) return 'bullish';
  if (minus > plus) return 'bearish';
  return 'neutral';
}

function majority(...biases: Bias[]): Bias {
  let bull = 0;
  let bear = 0;
  for (const b of biases) {
    if (b === 'bullish') bull++;
    else if (b === 'bearish') bear++;
  }
  if (bull > bear) return 'bullish';
  if (bear > bull) return 'bearish';
  return 'neutral';
}

async function analyseOne(symbol: string, interval: Interval, signal: AbortSignal): Promise<Row> {
  const candles = await fetchCandles(symbol, interval, 200, signal);
  const last = candles[candles.length - 1]?.c ?? Number.NaN;
  const s20 = sma(candles, 20);
  const s50 = sma(candles, 50);
  const r = rsi(candles, 14);
  const m = macd(candles);
  const a = adx(candles, 14);
  const trend = trendBias(last, s20, s50);
  const momentum = momentumBias(r, m?.histogram ?? null);
  const strength = strengthBias(a?.adx ?? null, a?.plusDI ?? null, a?.minusDI ?? null);
  return {
    interval,
    candles: candles.length,
    last,
    sma20: s20,
    sma50: s50,
    rsi14: r,
    macdHist: m?.histogram ?? null,
    adx: a?.adx ?? null,
    plusDI: a?.plusDI ?? null,
    minusDI: a?.minusDI ?? null,
    trend,
    momentum,
    strength,
    overall: majority(trend, momentum, strength),
  };
}

export const multiTimeframeAnalysis = defineTool({
  name: 'multi_timeframe_analysis',
  description: [
    'Run the same indicator set across several timeframes in parallel and',
    'return a per-timeframe bias matrix plus an alignment summary.',
    '',
    'Per timeframe: last close, SMA20, SMA50, RSI14, MACD histogram, ADX14',
    '(+DI/-DI), and three derived biases — trend (MA stack), momentum',
    '(RSI + MACD hist), strength (ADX / DI) — plus an overall majority.',
    '',
    'The alignment block counts bullish vs bearish overall biases across',
    "the requested timeframes. 'Aligned' = ≥75% of TFs agree; use this to",
    'gate trade setups that need multi-TF confluence.',
    '',
    'Default intervals when none given: 1h, 4h, 1d.',
    'Allowed: 15m 30m 1h 2h 4h 6h 12h 1d 1w.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    symbol: z.string().describe('Binance spot pair, uppercase (e.g. BTCUSDT)'),
    intervals: z.array(z.enum(INTERVALS)).min(1).max(6).optional(),
  }),
  async execute(input, ctx) {
    const symbol = input.symbol.toUpperCase();
    const intervals = input.intervals ?? (['1h', '4h', '1d'] as Interval[]);
    const rows = await Promise.all(intervals.map((i) => analyseOne(symbol, i, ctx.abortSignal)));
    let bull = 0;
    let bear = 0;
    for (const r of rows) {
      if (r.overall === 'bullish') bull++;
      else if (r.overall === 'bearish') bear++;
    }
    const total = rows.length;
    const dominant: Bias = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';
    const dominantCount = Math.max(bull, bear);
    const alignmentPct = total > 0 ? (dominantCount / total) * 100 : 0;
    return {
      symbol,
      intervals,
      alignment: {
        dominant,
        bullish: bull,
        bearish: bear,
        neutral: total - bull - bear,
        pct: alignmentPct,
        aligned: alignmentPct >= 75,
      },
      rows,
    };
  },
});
