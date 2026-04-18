import { z } from 'zod';
import { defineTool } from '../../tools/define.js';
import { type Candle, fetchKlines, INTERVALS } from '../binance.js';

// Log-return series from close prices — correlation on log returns is
// scale-invariant (doesn't matter if one asset costs $100k and another
// $0.30) and handles multi-year drift far better than raw-price corr.
function logReturns(candles: Candle[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]?.c;
    const cur = candles[i]?.c;
    if (!prev || !cur || prev <= 0 || cur <= 0) continue;
    out.push(Math.log(cur / prev));
  }
  return out;
}

// Pearson correlation over equal-length return series. Returns null for
// degenerate inputs (length mismatch, zero variance, too few samples) so the
// caller can skip the pair rather than surface a fake "0" correlation.
export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i] ?? 0;
    sumB += b[i] ?? 0;
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = (a[i] ?? 0) - meanA;
    const db = (b[i] ?? 0) - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  if (denA === 0 || denB === 0) return null;
  return num / Math.sqrt(denA * denB);
}

// Aligns return series to their shared length from the right (most recent
// bars). Binance occasionally returns fewer bars for newer listings, so
// without alignment a BTC-vs-newmemecoin corr would be undefined.
function alignRight<T>(series: T[][]): T[][] {
  const minLen = Math.min(...series.map((s) => s.length));
  return series.map((s) => s.slice(s.length - minLen));
}

export const correlateAssets = defineTool({
  name: 'correlate_assets',
  description: [
    'Pearson correlation of log returns between 2–8 symbols over the same',
    'interval + lookback. Log returns are scale-invariant so "BTC vs SHIB"',
    'is no more degenerate than "BTC vs ETH".',
    '',
    'Returns pairwise correlations plus the per-symbol alignment length so',
    'the caller can spot when one symbol has less history and the correlation',
    'is computed over the shorter window.',
    '',
    'Interpretation cheat sheet:',
    '  >  0.8   tightly coupled (same risk vector, do not pretend they hedge)',
    '  0.3–0.8  partial correlation, typical of sector peers',
    '  < 0.3    independent enough to diversify',
    '  negative genuine inverse — rare in crypto, verify it is not spurious',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    symbols: z
      .array(z.string())
      .min(2)
      .max(8)
      .describe('Binance spot pairs, e.g. ["BTCUSDT", "ETHUSDT", "SOLUSDT"]'),
    interval: z.enum(INTERVALS).describe('Candle interval'),
    lookback: z
      .number()
      .int()
      .min(30)
      .max(1000)
      .optional()
      .describe('Number of candles (default 200)'),
  }),
  async execute(input, ctx) {
    const lookback = input.lookback ?? 200;
    const symbols = input.symbols.map((s) => s.toUpperCase());
    // Parallel fetch: order preserved so indices line up with input.symbols.
    const candleBatches = await Promise.all(
      symbols.map((symbol) =>
        fetchKlines({ symbol, interval: input.interval, limit: lookback, signal: ctx.abortSignal }),
      ),
    );
    const returnsPerSymbol = candleBatches.map(logReturns);
    const aligned = alignRight(returnsPerSymbol);
    const alignmentLen = aligned[0]?.length ?? 0;

    const pairs: Record<string, number | null> = {};
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const a = aligned[i];
        const b = aligned[j];
        const si = symbols[i];
        const sj = symbols[j];
        if (!a || !b || !si || !sj) continue;
        pairs[`${si}|${sj}`] = pearson(a, b);
      }
    }

    return {
      symbols,
      interval: input.interval,
      lookback,
      alignmentLen,
      pairs,
    };
  },
});
