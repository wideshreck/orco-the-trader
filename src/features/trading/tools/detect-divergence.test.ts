import { describe, expect, it } from 'bun:test';
import { detectDivergence } from './detect-divergence.js';
import type { Candle } from './get-ohlcv.js';

const ctx = { abortSignal: new AbortController().signal } as Parameters<
  typeof detectDivergence.execute
>[1];

function c(t: number, h: number, l: number, close: number): Candle {
  return { t, o: close, h, l, c: close, v: 1 };
}

describe('detect_divergence', () => {
  it('finds a bullish divergence when price makes lower low but RSI holds', async () => {
    // Construct: long downtrend, then two distinct pivot lows where
    // the second low is deeper in price but RSI has recovered.
    const candles: Candle[] = [];
    // Warm-up downtrend 60 candles to seed RSI low.
    for (let i = 0; i < 60; i++) {
      const price = 200 - i;
      candles.push(c(i, price + 0.5, price - 0.5, price));
    }
    // Pivot low #1 at 140 (candle 60), surrounded by higher bars.
    for (let i = 0; i < 3; i++) candles.push(c(60 + i, 145, 144, 145)); // left
    candles.push(c(63, 141, 140, 141)); // pivot low #1
    for (let i = 0; i < 3; i++) candles.push(c(64 + i, 145, 144, 145)); // right
    // Rally — lifts RSI.
    for (let i = 0; i < 15; i++) candles.push(c(67 + i, 160 + i, 159 + i, 160 + i));
    // Pull back to a deeper low — but RSI should still be higher than at first low.
    for (let i = 0; i < 10; i++) candles.push(c(82 + i, 175 - i * 2, 174 - i * 2, 175 - i * 2));
    // Pivot low #2 at 135 — lower than 140 in price.
    for (let i = 0; i < 3; i++) candles.push(c(92 + i, 140, 139, 140)); // left
    candles.push(c(95, 136, 135, 136)); // pivot low #2
    for (let i = 0; i < 4; i++) candles.push(c(96 + i, 140, 139, 140)); // right

    const out = await detectDivergence.execute({ candles, indicator: 'rsi', strength: 3 }, ctx);
    // We expect at least one bullish divergence across the two lows.
    expect(out.bullish.length).toBeGreaterThan(0);
  });

  it('returns empty arrays on a clean uptrend', async () => {
    const candles: Candle[] = Array.from({ length: 120 }, (_, i) =>
      c(i, 100 + i + 0.5, 100 + i - 0.5, 100 + i),
    );
    const out = await detectDivergence.execute({ candles, strength: 3 }, ctx);
    expect(out.bullish).toEqual([]);
    // No two distinct pivot highs at decreasing price → no bearish either.
  });
});
