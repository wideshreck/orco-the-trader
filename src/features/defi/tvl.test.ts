import { describe, expect, it } from 'bun:test';
import { computeDeltas } from './tvl.js';

describe('computeDeltas', () => {
  it('returns nulls for empty series', () => {
    const d = computeDeltas([]);
    expect(d.currentTvl).toBeNull();
    expect(d.tvl7dChangePct).toBeNull();
    expect(d.tvl30dChangePct).toBeNull();
    expect(d.sampleCount).toBe(0);
  });

  it('computes 7d and 30d percentage changes against closest-not-after points', () => {
    const now = 1_700_000_000;
    const day = 24 * 3600;
    const series = [
      { date: now - 40 * day, tvl: 800 }, // pre-30d
      { date: now - 30 * day, tvl: 1000 }, // 30d ref
      { date: now - 7 * day, tvl: 1200 }, // 7d ref
      { date: now - day, tvl: 1400 },
      { date: now, tvl: 1500 },
    ];
    const d = computeDeltas(series);
    expect(d.currentTvl).toBe(1500);
    expect(d.tvl7dChangePct).toBeCloseTo(25, 1); // 1200 → 1500
    expect(d.tvl30dChangePct).toBeCloseTo(50, 1); // 1000 → 1500
    expect(d.sampleCount).toBe(5);
  });

  it('never peeks into the future for a sparse series', () => {
    const now = 1_700_000_000;
    const day = 24 * 3600;
    // Only a pre-8d sample exists; the 7d slot must not leak onto the
    // latest-after-latest value.
    const series = [
      { date: now - 8 * day, tvl: 500 },
      { date: now, tvl: 600 },
    ];
    const d = computeDeltas(series);
    expect(d.tvl7dChangePct).toBeCloseTo(20, 1); // 500 → 600
  });

  it('returns null for a percentage when the reference would be zero', () => {
    const now = 1_700_000_000;
    const day = 24 * 3600;
    const series = [
      { date: now - 7 * day, tvl: 0 },
      { date: now, tvl: 100 },
    ];
    const d = computeDeltas(series);
    expect(d.tvl7dChangePct).toBeNull();
  });

  it('handles negative changes', () => {
    const now = 1_700_000_000;
    const day = 24 * 3600;
    const series = [
      { date: now - 7 * day, tvl: 1000 },
      { date: now, tvl: 800 },
    ];
    const d = computeDeltas(series);
    expect(d.tvl7dChangePct).toBeCloseTo(-20, 1);
  });
});
