import { rsiSeries } from '../series.js';
import type { Strategy } from '../types.js';

export const rsiReversal: Strategy = {
  name: 'rsi_reversal',
  description:
    'Mean-reversion: long when RSI crosses up through oversold; short when RSI crosses down through overbought. Exits on opposite cross (or managed by stop/TP).',
  defaults: { rsiPeriod: 14, oversold: 30, overbought: 70 },
  prepare(bars, params) {
    const period = Math.max(2, Math.floor(params.rsiPeriod ?? 14));
    return { bars, series: { rsi: rsiSeries(bars, period) }, params };
  },
  signal(ctx, i, openPos) {
    const r = ctx.series.rsi;
    if (!r) return null;
    const now = r[i];
    const prev = r[i - 1];
    if (now === null || prev === null || now === undefined || prev === undefined) return null;
    const oversold = ctx.params.oversold ?? 30;
    const overbought = ctx.params.overbought ?? 70;
    if (openPos) {
      if (openPos.side === 'long' && prev < overbought && now >= overbought) return 'exit';
      if (openPos.side === 'short' && prev > oversold && now <= oversold) return 'exit';
      return null;
    }
    if (prev < oversold && now >= oversold) return 'enter-long';
    if (prev > overbought && now <= overbought) return 'enter-short';
    return null;
  },
};
