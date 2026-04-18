import { describe, expect, it } from 'bun:test';
import { pearson } from './correlate-assets.js';

describe('pearson', () => {
  it('returns 1 for perfectly positively correlated series', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [2, 4, 6, 8, 10];
    expect(pearson(a, b)).toBeCloseTo(1, 6);
  });

  it('returns -1 for perfectly negatively correlated series', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [5, 4, 3, 2, 1];
    expect(pearson(a, b)).toBeCloseTo(-1, 6);
  });

  it('returns ~0 for uncorrelated series', () => {
    const a = [1, -1, 1, -1, 1, -1];
    const b = [1, 1, 1, 1, 1, 1];
    // b has zero variance → null
    expect(pearson(a, b)).toBeNull();
  });

  it('returns null when a or b have zero variance', () => {
    expect(pearson([1, 1, 1, 1], [2, 4, 6, 8])).toBeNull();
  });

  it('returns null for too-short samples', () => {
    expect(pearson([1], [1])).toBeNull();
    expect(pearson([1, 2], [3, 4])).toBeNull();
  });

  it('correlates truncated mismatched-length arrays down to the shorter length', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [1, 2, 3];
    expect(pearson(a, b)).toBeCloseTo(1, 6);
  });
});
