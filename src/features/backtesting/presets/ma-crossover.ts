import { smaSeries } from '../series.js';
import type { Strategy } from '../types.js';

export const maCrossover: Strategy = {
  name: 'ma_crossover',
  description:
    'Trend-following: enter long when fast SMA crosses above slow SMA, short on the opposite cross. Exits on the reverse cross (or stop/TP).',
  defaults: { fast: 20, slow: 50 },
  prepare(bars, params) {
    const fast = Math.max(2, Math.floor(params.fast ?? 20));
    const slow = Math.max(fast + 1, Math.floor(params.slow ?? 50));
    return {
      bars,
      series: { fast: smaSeries(bars, fast), slow: smaSeries(bars, slow) },
      params,
    };
  },
  signal(ctx, i, openPos) {
    const f = ctx.series.fast;
    const s = ctx.series.slow;
    if (!f || !s) return null;
    const fn = f[i];
    const fp = f[i - 1];
    const sn = s[i];
    const sp = s[i - 1];
    if ([fn, fp, sn, sp].some((v) => v === null || v === undefined)) return null;
    const up = (fp as number) <= (sp as number) && (fn as number) > (sn as number);
    const down = (fp as number) >= (sp as number) && (fn as number) < (sn as number);
    if (openPos) {
      if (openPos.side === 'long' && down) return 'exit';
      if (openPos.side === 'short' && up) return 'exit';
      return null;
    }
    if (up) return 'enter-long';
    if (down) return 'enter-short';
    return null;
  },
};
