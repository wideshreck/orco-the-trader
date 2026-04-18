import { describe, expect, it } from 'bun:test';
import { computeVolumeSignal } from './compute-indicators.js';
import type { Candle } from './get-ohlcv.js';

function bar(v: number, i = 0): Candle {
  return { t: i * 60000, o: 100, h: 101, l: 99, c: 100, v };
}

describe('computeVolumeSignal', () => {
  it('returns insufficient when fewer than 21 bars are available', () => {
    const s = computeVolumeSignal(Array.from({ length: 5 }, (_, i) => bar(100, i)));
    expect(s.classification).toBe('insufficient');
    expect(s.ratio).toBeNull();
  });

  it('flags a 3x spike on the latest bar as a surge', () => {
    const tape: Candle[] = Array.from({ length: 20 }, (_, i) => bar(1000, i));
    tape.push(bar(3500, 20));
    const s = computeVolumeSignal(tape);
    expect(s.classification).toBe('surge');
    expect(s.ratio).toBeCloseTo(3.5, 2);
  });

  it('flags a modestly elevated bar (1.5x) as above', () => {
    const tape: Candle[] = Array.from({ length: 20 }, (_, i) => bar(1000, i));
    tape.push(bar(1500, 20));
    expect(computeVolumeSignal(tape).classification).toBe('above');
  });

  it('holds a 1.0x bar as normal', () => {
    const tape: Candle[] = Array.from({ length: 20 }, (_, i) => bar(1000, i));
    tape.push(bar(1000, 20));
    expect(computeVolumeSignal(tape).classification).toBe('normal');
  });

  it('calls a 0.5x bar below', () => {
    const tape: Candle[] = Array.from({ length: 20 }, (_, i) => bar(1000, i));
    tape.push(bar(500, 20));
    expect(computeVolumeSignal(tape).classification).toBe('below');
  });

  it('calls a 0.2x bar dry (shake-out territory)', () => {
    const tape: Candle[] = Array.from({ length: 20 }, (_, i) => bar(1000, i));
    tape.push(bar(200, 20));
    expect(computeVolumeSignal(tape).classification).toBe('dry');
  });

  it('excludes the latest bar from its own reference average', () => {
    // 20 bars of 1000 volume, then a 5000-volume bar. If we included the
    // latest in the avg, we'd get 5000/(20*1000+5000)*21 ≈ 4.2x. With
    // proper exclusion the ratio is exactly 5x.
    const tape: Candle[] = Array.from({ length: 20 }, (_, i) => bar(1000, i));
    tape.push(bar(5000, 20));
    const s = computeVolumeSignal(tape);
    expect(s.ratio).toBe(5);
    expect(s.avg20).toBe(1000);
  });
});
