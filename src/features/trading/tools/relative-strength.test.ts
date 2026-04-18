import { describe, expect, it } from 'bun:test';
import { computeRatioMetrics, ratioTrend } from './relative-strength.js';

describe('ratioTrend', () => {
  it('detects a monotonically rising ratio', () => {
    const ratios = Array.from({ length: 50 }, (_, i) => 1 + i * 0.01);
    expect(ratioTrend(ratios)).toBe('rising');
  });

  it('detects a monotonically falling ratio', () => {
    const ratios = Array.from({ length: 50 }, (_, i) => 2 - i * 0.02);
    expect(ratioTrend(ratios)).toBe('falling');
  });

  it('calls a noisy random walk flat', () => {
    const seed = 0.5;
    const ratios = Array.from({ length: 50 }, (_, i) => seed + Math.sin(i) * 0.01);
    expect(ratioTrend(ratios)).toBe('flat');
  });

  it('returns flat for too-short series', () => {
    expect(ratioTrend([1, 1.1, 1.2])).toBe('flat');
  });
});

describe('computeRatioMetrics', () => {
  it('computes current ratio from the last aligned bar', () => {
    const num = [100, 110, 120];
    const denom = [10, 11, 12];
    const m = computeRatioMetrics(num, denom);
    expect(m.currentRatio).toBe(10);
    expect(m.ratios).toHaveLength(3);
  });

  it('right-aligns mismatched-length series', () => {
    const num = [100, 110, 120, 130, 140]; // 5 bars
    const denom = [11, 12, 13]; // 3 bars — the newer ones
    const m = computeRatioMetrics(num, denom);
    // Only the 3 most recent bars align: 120/11, 130/12, 140/13
    expect(m.ratios).toHaveLength(3);
    expect(m.currentRatio).toBeCloseTo(140 / 13, 6);
  });

  it('computes 30d/90d % changes when history is long enough', () => {
    const num = Array.from({ length: 100 }, (_, i) => 100 + i);
    const denom = Array.from({ length: 100 }, () => 1);
    const m = computeRatioMetrics(num, denom);
    // Current ratio = 199; 30 bars back (index 69) = 169
    expect(m.change30d).toBeCloseTo(((199 - 169) / 169) * 100, 4);
    expect(m.change90d).toBeCloseTo(((199 - 109) / 109) * 100, 4);
  });

  it('returns null for deltas that reach beyond the available history', () => {
    const num = [100, 101, 102, 103];
    const denom = [1, 1, 1, 1];
    const m = computeRatioMetrics(num, denom);
    expect(m.change30d).toBeNull();
    expect(m.change90d).toBeNull();
  });

  it('skips bars where the denominator is zero or missing', () => {
    const num = [100, 110, 120];
    const denom = [0, 11, 12]; // first bar has zero denom
    const m = computeRatioMetrics(num, denom);
    expect(m.ratios).toHaveLength(2);
    expect(m.ratios[0]).toBe(10); // 110/11
  });
});
