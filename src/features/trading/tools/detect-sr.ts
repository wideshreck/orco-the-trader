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

type Pivot = { t: number; price: number; kind: 'high' | 'low' };
type Level = {
  price: number;
  kind: 'support' | 'resistance';
  touches: number;
  lastTouchT: number;
  firstTouchT: number;
};

function findPivots(candles: Candle[], strength: number): Pivot[] {
  const out: Pivot[] = [];
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
    if (isHigh) out.push({ t: cur.t, price: cur.h, kind: 'high' });
    if (isLow) out.push({ t: cur.t, price: cur.l, kind: 'low' });
  }
  return out;
}

function cluster(pivots: Pivot[], tolerancePct: number, lastClose: number): Level[] {
  if (pivots.length === 0) return [];
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const clusters: Pivot[][] = [];
  for (const p of sorted) {
    const last = clusters[clusters.length - 1];
    const anchor = last?.[0];
    if (!last || !anchor || Math.abs(p.price - anchor.price) / anchor.price > tolerancePct / 100) {
      clusters.push([p]);
    } else {
      last.push(p);
    }
  }
  return (
    clusters
      .map((group) => {
        const avg = group.reduce((s, g) => s + g.price, 0) / group.length;
        const times = group.map((g) => g.t);
        return {
          price: avg,
          kind: (avg < lastClose ? 'support' : 'resistance') as Level['kind'],
          touches: group.length,
          firstTouchT: Math.min(...times),
          lastTouchT: Math.max(...times),
        };
      })
      // Drop singletons — not real levels, one touch isn't confluence.
      .filter((l) => l.touches >= 2)
  );
}

export const detectSupportResistance = defineTool({
  name: 'detect_support_resistance',
  description: [
    'Detect horizontal support/resistance levels from an OHLCV candle',
    'series. Finds swing highs/lows via an N-bar fractal, clusters them',
    'within `tolerancePct` of each other, and reports each cluster as a',
    'level with touch count and first/last touch timestamp.',
    '',
    'Returns nearest support (highest level below current close), nearest',
    'resistance (lowest level above), and top-5 strongest levels overall',
    '(ranked by touches, then recency). Levels with a single touch are',
    'dropped.',
    '',
    'Call after get_ohlcv. Pass 100–300 candles of history. Defaults:',
    'strength=3 (fractal arms), tolerancePct=0.5.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    candles: z.array(candleSchema).min(20),
    strength: z.number().int().min(2).max(10).optional(),
    tolerancePct: z.number().min(0.1).max(5).optional(),
  }),
  async execute(input) {
    const candles = input.candles as Candle[];
    const strength = input.strength ?? 3;
    const tolerancePct = input.tolerancePct ?? 0.5;
    const last = candles[candles.length - 1];
    if (!last) throw new Error('empty candle series');
    const pivots = findPivots(candles, strength);
    const levels = cluster(pivots, tolerancePct, last.c);
    const supports = levels.filter((l) => l.kind === 'support').sort((a, b) => b.price - a.price);
    const resistances = levels
      .filter((l) => l.kind === 'resistance')
      .sort((a, b) => a.price - b.price);
    const strongest = [...levels]
      .sort((a, b) => b.touches - a.touches || b.lastTouchT - a.lastTouchT)
      .slice(0, 5);
    return {
      lastClose: last.c,
      pivotCount: pivots.length,
      levelCount: levels.length,
      nearestSupport: supports[0] ?? null,
      nearestResistance: resistances[0] ?? null,
      strongest,
    };
  },
});
