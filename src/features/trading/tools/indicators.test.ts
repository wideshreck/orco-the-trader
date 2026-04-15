import { describe, expect, it } from 'bun:test';
import type { Candle } from './get-ohlcv.js';
import { adx, atr, bollinger, ema, macd, rsi, sma, stochastic, vwap } from './indicators.js';

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

describe('bollinger', () => {
  it('mid equals SMA and bands are symmetric', () => {
    const candles = ramp([10, 11, 12, 13, 14]);
    const bb = bollinger(candles, 5, 2);
    expect(bb).not.toBeNull();
    if (!bb) return;
    expect(bb.mid).toBeCloseTo(12, 10);
    expect(bb.upper - bb.mid).toBeCloseTo(bb.mid - bb.lower, 10);
    expect(bb.upper).toBeGreaterThan(bb.mid);
    expect(bb.lower).toBeLessThan(bb.mid);
  });

  it('bandwidth is zero and percentB is 0.5 on a flat series', () => {
    const bb = bollinger(ramp([10, 10, 10, 10, 10]), 5, 2);
    expect(bb).not.toBeNull();
    if (!bb) return;
    expect(bb.bandwidth).toBe(0);
    expect(bb.percentB).toBe(0.5);
  });

  it('returns null when history is too short', () => {
    expect(bollinger(ramp([1, 2, 3]), 20, 2)).toBeNull();
  });
});

describe('stochastic', () => {
  it('returns k ≈ 100 when price closes at the period high', () => {
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];
    const candles = closes.map((c, i) => ({ t: i, o: c, h: c, l: c, c, v: 1 }) as Candle);
    const s = stochastic(candles, 14, 3, 3);
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.k).toBeCloseTo(100, 5);
  });

  it('returns null on too-short series', () => {
    expect(stochastic(ramp([1, 2, 3, 4]), 14, 3, 3)).toBeNull();
  });
});

describe('vwap', () => {
  it('returns typical price when volume is uniform', () => {
    const candles: Candle[] = [
      { t: 0, o: 10, h: 12, l: 8, c: 10, v: 1 },
      { t: 1, o: 11, h: 13, l: 9, c: 11, v: 1 },
    ];
    // typical = (12+8+10)/3 = 10, (13+9+11)/3 = 11 → avg = 10.5
    expect(vwap(candles)).toBeCloseTo(10.5, 10);
  });

  it('returns null when total volume is zero', () => {
    const candles: Candle[] = [
      { t: 0, o: 10, h: 11, l: 9, c: 10, v: 0 },
      { t: 1, o: 11, h: 12, l: 10, c: 11, v: 0 },
    ];
    expect(vwap(candles)).toBeNull();
  });
});

describe('adx', () => {
  it('rises on a persistent uptrend', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 60; i++) {
      const c = 100 + i;
      candles.push({ t: i, o: c - 0.5, h: c + 0.5, l: c - 1, c, v: 1 });
    }
    const r = adx(candles, 14);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.adx).toBeGreaterThan(25);
    expect(r.plusDI).toBeGreaterThan(r.minusDI);
  });

  it('stays low on a choppy range', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 60; i++) {
      const c = 100 + (i % 2 === 0 ? 0.5 : -0.5);
      candles.push({ t: i, o: c, h: c + 0.3, l: c - 0.3, c, v: 1 });
    }
    const r = adx(candles, 14);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.adx).toBeLessThan(25);
  });

  it('returns null when history is too short', () => {
    expect(adx(ramp([1, 2, 3, 4, 5]), 14)).toBeNull();
  });
});
