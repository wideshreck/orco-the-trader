import { rollingHigh, rollingLow } from '../series.js';
import type { Strategy } from '../types.js';

export const donchianBreakout: Strategy = {
  name: 'donchian_breakout',
  description:
    'Classic Turtle-style breakout: enter long on close above the N-bar high, short on close below the N-bar low. Exit on opposite M-bar breakout (or stop/TP).',
  defaults: { entry: 20, exit: 10 },
  prepare(bars, params) {
    const entry = Math.max(2, Math.floor(params.entry ?? 20));
    const exit = Math.max(2, Math.floor(params.exit ?? 10));
    return {
      bars,
      series: {
        entryHigh: rollingHigh(bars, entry),
        entryLow: rollingLow(bars, entry),
        exitHigh: rollingHigh(bars, exit),
        exitLow: rollingLow(bars, exit),
      },
      params,
    };
  },
  signal(ctx, i, openPos) {
    const bar = ctx.bars[i];
    if (!bar) return null;
    // Breakout levels use PRIOR bars to avoid self-comparison; take index i-1.
    const entryHigh = ctx.series.entryHigh?.[i - 1];
    const entryLow = ctx.series.entryLow?.[i - 1];
    const exitHigh = ctx.series.exitHigh?.[i - 1];
    const exitLow = ctx.series.exitLow?.[i - 1];
    if (openPos) {
      if (openPos.side === 'long' && exitLow !== null && exitLow !== undefined && bar.c < exitLow) {
        return 'exit';
      }
      if (
        openPos.side === 'short' &&
        exitHigh !== null &&
        exitHigh !== undefined &&
        bar.c > exitHigh
      ) {
        return 'exit';
      }
      return null;
    }
    if (entryHigh !== null && entryHigh !== undefined && bar.c > entryHigh) {
      return 'enter-long';
    }
    if (entryLow !== null && entryLow !== undefined && bar.c < entryLow) {
      return 'enter-short';
    }
    return null;
  },
};
