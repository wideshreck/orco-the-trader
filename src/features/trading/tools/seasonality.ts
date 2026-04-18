import { z } from 'zod';
import { defineTool } from '../../tools/define.js';
import { type Candle, fetchKlines } from '../binance.js';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Bucket a bar's return by day-of-week (for 1d data) or hour-of-day (for
// 1h data). UTC throughout — otherwise summer-time shifts would bleed
// results across adjacent buckets twice a year.
function bucketKey(candle: Candle, mode: 'day_of_week' | 'hour_of_day'): string {
  const d = new Date(candle.t);
  if (mode === 'day_of_week') return DAY_LABELS[d.getUTCDay()] ?? 'unknown';
  return String(d.getUTCHours()).padStart(2, '0'); // "00" … "23"
}

function candleReturnPct(prev: Candle, cur: Candle): number {
  return ((cur.c - prev.c) / prev.c) * 100;
}

type BucketStats = {
  avgReturnPct: number;
  medianReturnPct: number;
  winRatePct: number;
  count: number;
  stdDevPct: number;
};

export function aggregate(
  candles: Candle[],
  mode: 'day_of_week' | 'hour_of_day',
): Record<string, BucketStats> {
  const groups = new Map<string, number[]>();
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev || !cur || prev.c <= 0) continue;
    const key = bucketKey(cur, mode);
    const bucket = groups.get(key) ?? [];
    bucket.push(candleReturnPct(prev, cur));
    groups.set(key, bucket);
  }

  const out: Record<string, BucketStats> = {};
  for (const [key, values] of groups) {
    if (values.length === 0) continue;
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const wins = values.filter((v) => v > 0).length;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const median =
      sorted.length % 2 === 0
        ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
        : (sorted[mid] ?? 0);
    const variance = values.reduce((acc, v) => acc + (v - avg) * (v - avg), 0) / values.length;
    out[key] = {
      avgReturnPct: avg,
      medianReturnPct: median,
      winRatePct: (wins / values.length) * 100,
      count: values.length,
      stdDevPct: Math.sqrt(variance),
    };
  }
  return out;
}

function pickExtremes(buckets: Record<string, BucketStats>) {
  let best: { label: string; avgReturnPct: number } | null = null;
  let worst: { label: string; avgReturnPct: number } | null = null;
  for (const [label, s] of Object.entries(buckets)) {
    if (s.count < 5) continue; // skip thin buckets
    if (!best || s.avgReturnPct > best.avgReturnPct) {
      best = { label, avgReturnPct: s.avgReturnPct };
    }
    if (!worst || s.avgReturnPct < worst.avgReturnPct) {
      worst = { label, avgReturnPct: s.avgReturnPct };
    }
  }
  return { best, worst };
}

export const seasonality = defineTool({
  name: 'seasonality',
  description: [
    'Day-of-week or hour-of-day return distribution for a Binance spot',
    'symbol — pure local compute, one OHLCV fetch, no extra network.',
    '',
    'Picks bucketing from the interval:',
    '  - 1d → day_of_week (Mon/Tue/.../Sun)',
    '  - 1h → hour_of_day (UTC 00..23)',
    '',
    'Returns per-bucket avg return %, median, win rate, sample count, and',
    'std-dev, plus the best/worst buckets by avg return (thin buckets with',
    '<5 samples excluded so a freak outlier does not crown a winner).',
    '',
    'Treat results as descriptive, not predictive. A 365-day lookback on',
    '1d gives ~52 samples per weekday — enough to notice a pattern, not',
    'enough to trade it blindly. Always pair with a regime check.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    symbol: z.string().describe('Binance spot pair, e.g. BTCUSDT'),
    interval: z.enum(['1d', '1h']).describe('1d → weekday buckets, 1h → hour buckets'),
    lookback: z
      .number()
      .int()
      .min(50)
      .max(1000)
      .optional()
      .describe('Number of candles (default 365)'),
  }),
  async execute(input, ctx) {
    const lookback = input.lookback ?? 365;
    const symbol = input.symbol.toUpperCase();
    const candles = await fetchKlines({
      symbol,
      interval: input.interval,
      limit: lookback,
      signal: ctx.abortSignal,
    });
    if (candles.length < 30) {
      throw new Error(`seasonality needs >=30 bars, got ${candles.length} for ${symbol}`);
    }
    const mode: 'day_of_week' | 'hour_of_day' =
      input.interval === '1d' ? 'day_of_week' : 'hour_of_day';
    const buckets = aggregate(candles, mode);
    const { best, worst } = pickExtremes(buckets);
    return {
      symbol,
      interval: input.interval,
      bucketing: mode,
      lookback: candles.length,
      buckets,
      best,
      worst,
    };
  },
});
