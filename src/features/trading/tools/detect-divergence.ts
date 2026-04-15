import { z } from 'zod';
import { defineTool } from '../../tools/define.js';
import type { Candle } from './get-ohlcv.js';

const candleSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number(),
});

function rsiSeries(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev || !cur) return out;
    const diff = cur.c - prev.c;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev || !cur) continue;
    const diff = cur.c - prev.c;
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function macdHistSeries(candles: Candle[]): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  const fast = 12;
  const slow = 26;
  const sig = 9;
  if (candles.length < slow + sig) return out;
  const closes = candles.map((c) => c.c);
  const ema = (src: number[], period: number): (number | null)[] => {
    const series: (number | null)[] = new Array(src.length).fill(null);
    if (src.length < period) return series;
    let acc = 0;
    for (let i = 0; i < period; i++) acc += src[i] ?? 0;
    let ma = acc / period;
    series[period - 1] = ma;
    const k = 2 / (period + 1);
    for (let i = period; i < src.length; i++) {
      ma = (src[i] ?? 0) * k + ma * (1 - k);
      series[i] = ma;
    }
    return series;
  };
  const fastE = ema(closes, fast);
  const slowE = ema(closes, slow);
  const macdLine: (number | null)[] = closes.map((_, i) =>
    fastE[i] !== null && slowE[i] !== null ? (fastE[i] as number) - (slowE[i] as number) : null,
  );
  const compact = macdLine.filter((v): v is number => v !== null);
  const sigSeries = ema(compact, sig);
  // Align signal back to macd indices.
  const offset = macdLine.findIndex((v) => v !== null);
  for (let i = 0; i < compact.length; i++) {
    const s = sigSeries[i];
    const m = compact[i];
    if (s === null || s === undefined || m === undefined) continue;
    out[offset + i] = m - s;
  }
  return out;
}

type PivotKind = 'low' | 'high';
type PricePivot = { i: number; t: number; price: number; kind: PivotKind };

function findPricePivots(candles: Candle[], strength: number): PricePivot[] {
  const out: PricePivot[] = [];
  for (let i = strength; i < candles.length - strength; i++) {
    const cur = candles[i];
    if (!cur) continue;
    let isHigh = true;
    let isLow = true;
    for (let j = i - strength; j <= i + strength; j++) {
      if (j === i) continue;
      const c = candles[j];
      if (!c) continue;
      if (c.h > cur.h) isHigh = false;
      if (c.l < cur.l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) out.push({ i, t: cur.t, price: cur.h, kind: 'high' });
    if (isLow) out.push({ i, t: cur.t, price: cur.l, kind: 'low' });
  }
  return out;
}

type DivRow = {
  kind: 'bullish' | 'bearish';
  indicator: 'rsi' | 'macd';
  firstT: number;
  lastT: number;
  pricePrev: number;
  priceCur: number;
  indPrev: number;
  indCur: number;
};

function findDivergences(
  pivots: PricePivot[],
  series: (number | null)[],
  indicatorName: 'rsi' | 'macd',
): DivRow[] {
  const rows: DivRow[] = [];
  const lows = pivots.filter((p) => p.kind === 'low');
  const highs = pivots.filter((p) => p.kind === 'high');
  // Compare consecutive same-kind pivots — classic two-point divergence.
  for (let i = 1; i < lows.length; i++) {
    const a = lows[i - 1];
    const b = lows[i];
    if (!a || !b) continue;
    const ia = series[a.i];
    const ib = series[b.i];
    if (ia === null || ib === null || ia === undefined || ib === undefined) continue;
    if (b.price < a.price && ib > ia) {
      rows.push({
        kind: 'bullish',
        indicator: indicatorName,
        firstT: a.t,
        lastT: b.t,
        pricePrev: a.price,
        priceCur: b.price,
        indPrev: ia,
        indCur: ib,
      });
    }
  }
  for (let i = 1; i < highs.length; i++) {
    const a = highs[i - 1];
    const b = highs[i];
    if (!a || !b) continue;
    const ia = series[a.i];
    const ib = series[b.i];
    if (ia === null || ib === null || ia === undefined || ib === undefined) continue;
    if (b.price > a.price && ib < ia) {
      rows.push({
        kind: 'bearish',
        indicator: indicatorName,
        firstT: a.t,
        lastT: b.t,
        pricePrev: a.price,
        priceCur: b.price,
        indPrev: ia,
        indCur: ib,
      });
    }
  }
  return rows;
}

export const detectDivergence = defineTool({
  name: 'detect_divergence',
  description: [
    'Detect classic bullish/bearish divergences between price and RSI and/or',
    'MACD histogram. Uses two-point pivot comparison with an N-bar fractal.',
    '',
    'Bullish: price makes a lower low but the indicator makes a higher low →',
    'momentum is not confirming the weakness; reversal-up candidate.',
    'Bearish: price makes a higher high but the indicator makes a lower high',
    '→ momentum fading at the top; reversal-down candidate.',
    '',
    'Call after get_ohlcv. Returns the 3 most recent bullish and 3 most',
    'recent bearish signals found within the series, plus `latest` — the',
    'single freshest signal (if any).',
    '',
    'Defaults: indicator=both, strength=3. Need at least 60 candles for',
    'reliable MACD history.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    candles: z.array(candleSchema).min(30),
    indicator: z.enum(['rsi', 'macd', 'both']).optional(),
    strength: z.number().int().min(2).max(10).optional(),
  }),
  async execute(input) {
    const candles = input.candles as Candle[];
    const pick = input.indicator ?? 'both';
    const strength = input.strength ?? 3;
    const pivots = findPricePivots(candles, strength);
    const rows: DivRow[] = [];
    if (pick === 'rsi' || pick === 'both') {
      rows.push(...findDivergences(pivots, rsiSeries(candles, 14), 'rsi'));
    }
    if (pick === 'macd' || pick === 'both') {
      rows.push(...findDivergences(pivots, macdHistSeries(candles), 'macd'));
    }
    rows.sort((a, b) => b.lastT - a.lastT);
    const bullish = rows.filter((r) => r.kind === 'bullish').slice(0, 3);
    const bearish = rows.filter((r) => r.kind === 'bearish').slice(0, 3);
    return {
      pivotCount: pivots.length,
      latest: rows[0] ?? null,
      bullish,
      bearish,
    };
  },
});
