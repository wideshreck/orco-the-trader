import { describe, expect, it } from 'bun:test';
import type { Candle } from './get-ohlcv.js';
import { atr, ema, macd, rsi, sma } from './indicators.js';

function candle(c: number, h = c, l = c, o = c, v = 0, t = 0): Candle {
  return { t, o, h, l, c, v };
}

function ramp(closes: number[]): Candle[] {
  return closes.map((c, i) => candle(c, c + 1, c - 1, c, 100, i * 60000));
}

describe('sma', () => {
  it('averages the last N closes', () => {
    const candles = ramp([1, 2, 3, 4, 5]);
    expect(sma(candles, 3)).toBe(4); // (3+4+5)/3
    expect(sma(candles, 5)).toBe(3);
  });

  it('returns null when there is not enough data', () => {
    expect(sma(ramp([1, 2]), 5)).toBeNull();
  });
});

describe('ema', () => {
  it('matches SMA when all values are constant', () => {
    const candles = ramp([10, 10, 10, 10, 10, 10]);
    expect(ema(candles, 3)).toBeCloseTo(10, 10);
  });

  it('reacts to a sudden spike faster than SMA', () => {
    // Flat then sudden jump — EMA should land above SMA because the fresh spike
    // gets more weight in the recursive formula.
    const candles = ramp([5, 5, 5, 5, 5, 5, 10]);
    const e = ema(candles, 3);
    const s = sma(candles, 3);
    expect(e).not.toBeNull();
    expect(s).not.toBeNull();
    expect(e as number).toBeGreaterThan(s as number);
  });
});

describe('rsi', () => {
  it('returns 100 when every candle is a gain (no losses)', () => {
    const candles = ramp([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(rsi(candles, 14)).toBe(100);
  });

  it('sits near 50 for a flat series', () => {
    // All equal closes → no gains or losses → avgLoss is 0 → returns 100 per our impl.
    // Instead build a mildly oscillating series.
    const closes = [
      10, 10.1, 10, 10.1, 10, 10.1, 10, 10.1, 10, 10.1, 10, 10.1, 10, 10.1, 10, 10.1, 10,
    ];
    const r = rsi(ramp(closes), 14);
    expect(r).not.toBeNull();
    expect(r as number).toBeGreaterThan(40);
    expect(r as number).toBeLessThan(60);
  });

  it('returns null for too-short series', () => {
    expect(rsi(ramp([1, 2, 3]), 14)).toBeNull();
  });
});

describe('macd', () => {
  it('returns null when series is shorter than slow + signal', () => {
    expect(macd(ramp([1, 2, 3]))).toBeNull();
  });

  it('returns finite numbers on a ramp', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const m = macd(ramp(closes));
    expect(m).not.toBeNull();
    if (!m) return;
    expect(Number.isFinite(m.macd)).toBe(true);
    expect(Number.isFinite(m.signal)).toBe(true);
    expect(Number.isFinite(m.histogram)).toBe(true);
  });

  it('histogram equals macd minus signal', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const m = macd(ramp(closes));
    if (!m) throw new Error('expected result');
    expect(m.histogram).toBeCloseTo(m.macd - m.signal, 10);
  });
});

describe('atr', () => {
  it('returns null for short series', () => {
    expect(atr(ramp([1, 2, 3]), 14)).toBeNull();
  });

  it('is positive and finite on typical data', () => {
    const candles = Array.from({ length: 30 }, (_, i) =>
      candle(100 + i, 100 + i + 2, 100 + i - 2, 100 + i - 1, 0, i),
    );
    const a = atr(candles, 14);
    expect(a).not.toBeNull();
    expect((a as number) > 0).toBe(true);
    expect(Number.isFinite(a as number)).toBe(true);
  });
});
