import { describe, expect, it } from 'bun:test';
import type { Candle } from '../binance.js';
import { aggregate } from './seasonality.js';

// Build a synthetic daily series with a baked-in weekday pattern:
// every Monday bar closes up 2%, every Friday closes down 1%, others flat.
function syntheticDaily(weeks: number): Candle[] {
  const out: Candle[] = [];
  // Start on a known Sunday UTC (2024-01-07) so day-of-week math is stable.
  const start = Date.UTC(2024, 0, 7);
  const dayMs = 24 * 3600 * 1000;
  let price = 100;
  for (let i = 0; i < weeks * 7 + 1; i++) {
    const t = start + i * dayMs;
    const dow = new Date(t).getUTCDay();
    const prev = price;
    if (dow === 1)
      price = price * 1.02; // Monday +2%
    else if (dow === 5) price = price * 0.99; // Friday -1%
    out.push({ t, o: prev, h: prev, l: prev, c: price, v: 100 });
  }
  return out;
}

describe('aggregate (seasonality)', () => {
  it('surfaces the baked-in weekday pattern', () => {
    const candles = syntheticDaily(20);
    const buckets = aggregate(candles, 'day_of_week');
    // Monday ≈ +2%, Friday ≈ -1%
    expect(buckets.Monday?.avgReturnPct).toBeCloseTo(2, 2);
    expect(buckets.Friday?.avgReturnPct).toBeCloseTo(-1, 2);
    // Flat days ≈ 0
    expect(buckets.Tuesday?.avgReturnPct).toBeCloseTo(0, 6);
  });

  it('reports a 100% win rate on a dead-consistent positive bucket', () => {
    const candles = syntheticDaily(10);
    const buckets = aggregate(candles, 'day_of_week');
    expect(buckets.Monday?.winRatePct).toBe(100);
    expect(buckets.Friday?.winRatePct).toBe(0);
  });

  it('counts each bucket across the lookback', () => {
    const candles = syntheticDaily(10); // 10*7 = 70 bars + initial
    const buckets = aggregate(candles, 'day_of_week');
    expect(buckets.Monday?.count).toBe(10);
  });

  it('handles hour_of_day bucketing on a 24x sequence', () => {
    const start = Date.UTC(2024, 0, 7, 0, 0, 0);
    const hour = 3600 * 1000;
    const candles: Candle[] = [];
    let price = 100;
    for (let i = 0; i < 24 * 5; i++) {
      const t = start + i * hour;
      const prev = price;
      const h = new Date(t).getUTCHours();
      // Hour 9 always +1%, hour 18 always -1%, rest flat
      if (h === 9) price *= 1.01;
      else if (h === 18) price *= 0.99;
      candles.push({ t, o: prev, h: prev, l: prev, c: price, v: 1 });
    }
    const buckets = aggregate(candles, 'hour_of_day');
    expect(buckets['09']?.avgReturnPct).toBeCloseTo(1, 2);
    expect(buckets['18']?.avgReturnPct).toBeCloseTo(-1, 2);
  });

  it('skips bars where prev close is non-positive', () => {
    const candles: Candle[] = [
      { t: Date.UTC(2024, 0, 1), o: 0, h: 0, l: 0, c: 0, v: 0 },
      { t: Date.UTC(2024, 0, 2), o: 100, h: 100, l: 100, c: 100, v: 0 },
      { t: Date.UTC(2024, 0, 3), o: 100, h: 100, l: 100, c: 102, v: 0 },
    ];
    const buckets = aggregate(candles, 'day_of_week');
    // Only the 100 → 102 transition (on Wednesday UTC) should count
    const total = Object.values(buckets).reduce((a, b) => a + b.count, 0);
    expect(total).toBe(1);
  });
});
