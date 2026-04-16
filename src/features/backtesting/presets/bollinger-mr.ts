import { bollingerSeries } from '../series.js';
import type { Strategy } from '../types.js';

export const bollingerMeanReversion: Strategy = {
  name: 'bollinger_mean_reversion',
  description:
    'Mean-reversion: long when price closes below the lower Bollinger band; short when it closes above the upper band. Exits when price crosses back through the middle band (or stop/TP).',
  defaults: { period: 20, mult: 2 },
  prepare(bars, params) {
    const period = Math.max(5, Math.floor(params.period ?? 20));
    const mult = Math.max(0.5, params.mult ?? 2);
    const bb = bollingerSeries(bars, period, mult);
    return { bars, series: { upper: bb.upper, mid: bb.mid, lower: bb.lower }, params };
  },
  signal(ctx, i, openPos) {
    const upper = ctx.series.upper?.[i];
    const lower = ctx.series.lower?.[i];
    const mid = ctx.series.mid?.[i];
    const midPrev = ctx.series.mid?.[i - 1];
    const bar = ctx.bars[i];
    const prevBar = ctx.bars[i - 1];
    if (
      !bar ||
      !prevBar ||
      upper === null ||
      upper === undefined ||
      lower === null ||
      lower === undefined ||
      mid === null ||
      mid === undefined ||
      midPrev === null ||
      midPrev === undefined
    ) {
      return null;
    }
    if (openPos) {
      // Exit long once price closes back above mid; exit short once it closes below mid.
      if (openPos.side === 'long' && prevBar.c < midPrev && bar.c >= mid) return 'exit';
      if (openPos.side === 'short' && prevBar.c > midPrev && bar.c <= mid) return 'exit';
      return null;
    }
    if (bar.c < lower) return 'enter-long';
    if (bar.c > upper) return 'enter-short';
    return null;
  },
};
