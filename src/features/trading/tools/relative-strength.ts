import { z } from 'zod';
import { defineTool } from '../../tools/define.js';
import { fetchKlines, INTERVALS } from '../binance.js';

// Is the log-ratio series trending or just oscillating? We compare the net
// drift (start→end in log space) to the series' std-dev. Drift >2σ is a
// meaningful trend; anything inside the noise band is flat. Works for both
// clean monotonic series and slightly noisy real-world data.
export function ratioTrend(ratios: number[]): 'rising' | 'flat' | 'falling' {
  if (ratios.length < 10) return 'flat';
  const logs = ratios.map((r) => Math.log(r));
  const n = logs.length;
  let mean = 0;
  for (const y of logs) mean += y;
  mean /= n;
  let variance = 0;
  for (const y of logs) variance += (y - mean) * (y - mean);
  variance /= n;
  const stdDev = Math.sqrt(variance);
  const drift = (logs[n - 1] ?? 0) - (logs[0] ?? 0);
  if (stdDev === 0) {
    if (drift > 0) return 'rising';
    if (drift < 0) return 'falling';
    return 'flat';
  }
  const normalized = drift / stdDev;
  // 2σ cutoff: clean monotonic trends come out ≥3, noisy sine oscillation
  // lands near 1, so a 2 boundary separates them cleanly.
  if (Math.abs(normalized) < 2) return 'flat';
  return normalized > 0 ? 'rising' : 'falling';
}

export function computeRatioMetrics(
  numerator: number[],
  denominator: number[],
): {
  ratios: number[];
  currentRatio: number;
  change30d: number | null;
  change90d: number | null;
  trend: 'rising' | 'flat' | 'falling';
} {
  const n = Math.min(numerator.length, denominator.length);
  if (n === 0) {
    return { ratios: [], currentRatio: 0, change30d: null, change90d: null, trend: 'flat' };
  }
  // Right-align: if one series has more bars, drop the older ones so both
  // end on the same timestamp.
  const a = numerator.slice(-n);
  const b = denominator.slice(-n);
  const ratios: number[] = [];
  for (let i = 0; i < n; i++) {
    const ai = a[i];
    const bi = b[i];
    if (ai === undefined || bi === undefined || bi <= 0) continue;
    ratios.push(ai / bi);
  }
  const current = ratios[ratios.length - 1] ?? 0;
  const pctChange = (back: number): number | null => {
    if (ratios.length <= back) return null;
    const prior = ratios[ratios.length - 1 - back];
    if (!prior || prior <= 0) return null;
    return ((current - prior) / prior) * 100;
  };
  return {
    ratios,
    currentRatio: current,
    change30d: pctChange(30),
    change90d: pctChange(90),
    trend: ratioTrend(ratios),
  };
}

export const relativeStrength = defineTool({
  name: 'relative_strength',
  description: [
    'Relative-strength analysis: how symbol is performing *versus* a',
    'benchmark (default BTCUSDT). Computes the ratio series on aligned',
    'bars, the 30-bar and 90-bar % change in that ratio, and a trend',
    'label (rising | flat | falling) from a std-dev-normalized linear fit.',
    '',
    'Why this matters: price correlation alone does not tell you direction.',
    'ETH can be 91% correlated with BTC and still be *bleeding* against it',
    '(ratio falling) — meaning a long ETH bet is a strictly worse version',
    'of a long BTC bet. Check this before sizing any "leveraged BTC beta"',
    'trade.',
    '',
    'Interpretation:',
    '  rising  → numerator is outperforming, bullish for the pair trade',
    '  flat    → moving together, no relative edge either way',
    '  falling → numerator is the weaker sibling; buying it is paying up',
    '            to get a watered-down version of the benchmark',
    '',
    'Pair with correlate_assets when the correlation is high (>0.8) — the',
    'two together tell you both "are they coupled?" and "if coupled, which',
    'one is leading?".',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    symbol: z.string().describe('Binance spot pair, e.g. ETHUSDT'),
    vs: z.string().optional().describe('Benchmark, default BTCUSDT'),
    interval: z.enum(INTERVALS).optional().describe('Candle interval, default 1d'),
    lookback: z
      .number()
      .int()
      .min(30)
      .max(1000)
      .optional()
      .describe('Number of candles (default 120 so 30d + 90d deltas both land)'),
  }),
  async execute(input, ctx) {
    const symbol = input.symbol.toUpperCase();
    const vs = (input.vs ?? 'BTCUSDT').toUpperCase();
    const interval = input.interval ?? '1d';
    const lookback = input.lookback ?? 120;
    if (symbol === vs) {
      throw new Error(`relative_strength: symbol and benchmark are the same (${symbol})`);
    }
    const [numCandles, denomCandles] = await Promise.all([
      fetchKlines({ symbol, interval, limit: lookback, signal: ctx.abortSignal }),
      fetchKlines({ symbol: vs, interval, limit: lookback, signal: ctx.abortSignal }),
    ]);
    const closes = (bars: { c: number }[]) => bars.map((b) => b.c);
    const metrics = computeRatioMetrics(closes(numCandles), closes(denomCandles));
    return {
      symbol,
      vs,
      interval,
      lookback,
      alignedBars: metrics.ratios.length,
      currentRatio: metrics.currentRatio,
      change30d: metrics.change30d,
      change90d: metrics.change90d,
      trend: metrics.trend,
      interpretation: verdictFor(metrics.trend, metrics.change30d, metrics.change90d),
    };
  },
});

function verdictFor(
  trend: 'rising' | 'flat' | 'falling',
  c30: number | null,
  c90: number | null,
): string {
  if (trend === 'rising') {
    return 'numerator is outperforming the benchmark — the long trade has relative edge';
  }
  if (trend === 'falling') {
    const worst = [c30, c90].filter((v): v is number => typeof v === 'number');
    if (worst.length === 0) return 'numerator is the weaker sibling';
    const minimum = Math.min(...worst);
    return `numerator is bleeding against the benchmark (${minimum.toFixed(1)}% weaker on the worst window); long exposure here is a strictly worse version of long-benchmark`;
  }
  return 'ratio is flat — no relative edge either direction; use correlation, not leadership, for sizing';
}
