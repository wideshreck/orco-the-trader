import { describe, expect, it } from 'bun:test';
import { detectSupportResistance } from './detect-sr.js';
import type { Candle } from './get-ohlcv.js';

const ctx = { abortSignal: new AbortController().signal } as Parameters<
  typeof detectSupportResistance.execute
>[1];

function c(t: number, h: number, l: number, close: number): Candle {
  return { t, o: close, h, l, c: close, v: 1 };
}

describe('detect_support_resistance', () => {
  it('finds a level where price tests the same low three times', async () => {
    // Sawtooth between 100 and 110, bottom repeatedly at 100.
    const candles: Candle[] = [];
    let t = 0;
    for (let rep = 0; rep < 4; rep++) {
      // down leg (low = 100)
      candles.push(c(t++, 105, 104, 104));
      candles.push(c(t++, 103, 102, 102));
      candles.push(c(t++, 101, 100, 100)); // pivot low
      candles.push(c(t++, 103, 101, 103));
      candles.push(c(t++, 106, 104, 106));
      candles.push(c(t++, 109, 107, 109));
      candles.push(c(t++, 110, 108, 110)); // pivot high
      candles.push(c(t++, 108, 106, 106));
    }
    // end sitting at 106 (between levels)
    const out = await detectSupportResistance.execute({ candles, strength: 2 }, ctx);
    expect(out.nearestSupport).not.toBeNull();
    expect(out.nearestResistance).not.toBeNull();
    expect(out.nearestSupport?.price).toBeLessThan(out.lastClose);
    expect(out.nearestResistance?.price).toBeGreaterThan(out.lastClose);
    // The 100 low cluster should have touches ≥ 3.
    const supportLevel = out.strongest.find((l) => Math.abs(l.price - 100) / 100 < 0.01);
    expect(supportLevel).toBeDefined();
    expect((supportLevel?.touches ?? 0) >= 3).toBe(true);
  });

  it('reports zero levels on a pure monotonic ramp', async () => {
    const candles: Candle[] = Array.from({ length: 50 }, (_, i) =>
      c(i, 100 + i + 0.5, 100 + i - 0.5, 100 + i),
    );
    const out = await detectSupportResistance.execute({ candles, strength: 3 }, ctx);
    // Each candle's low is unique → no multi-touch cluster possible.
    expect(out.levelCount).toBe(0);
  });
});
