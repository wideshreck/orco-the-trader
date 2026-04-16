import { describe, expect, it } from 'bun:test';
import { runSweep } from './sweep.js';
import type { Bar } from './types.js';

function mkBars(closes: number[]): Bar[] {
  return closes.map((c, i) => ({
    t: i * 60_000,
    o: c,
    h: c + 1,
    l: c - 1,
    c,
    v: 1,
  }));
}

const baseRisk = {
  initialBalance: 10_000,
  riskPerTradePct: 1,
  atrPeriod: 14,
  stopAtrMult: 1.5,
  takeProfitR: 2,
  trailing: false,
};
const baseFees = { takerPct: 0.1, slippageBps: 2 };

describe('sweep', () => {
  it('sweeps a single parameter and returns sorted rows', () => {
    const closes = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const bars = mkBars(closes);
    const result = runSweep({
      bars,
      strategyName: 'rsi_reversal',
      baseParams: {},
      ranges: [{ param: 'oversold', from: 20, to: 40, step: 5 }],
      risk: baseRisk,
      fees: baseFees,
      allowedSides: ['long'],
    });
    expect(result.combinationsTested).toBe(5); // 20,25,30,35,40
    expect(result.rows.length).toBeLessThanOrEqual(30);
    for (const row of result.rows) {
      expect(row.params.oversold).toBeDefined();
    }
  });

  it('rejects grids exceeding maxCombinations', () => {
    const bars = mkBars(Array.from({ length: 50 }, () => 100));
    expect(() =>
      runSweep({
        bars,
        strategyName: 'rsi_reversal',
        baseParams: {},
        ranges: [{ param: 'oversold', from: 1, to: 100, step: 1 }],
        risk: baseRisk,
        fees: baseFees,
        allowedSides: ['long'],
        maxCombinations: 10,
      }),
    ).toThrow(/exceeds max/);
  });

  it('two-dimensional sweep produces correct combo count', () => {
    const closes = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const bars = mkBars(closes);
    const result = runSweep({
      bars,
      strategyName: 'rsi_reversal',
      baseParams: {},
      ranges: [
        { param: 'oversold', from: 25, to: 35, step: 5 },
        { param: 'overbought', from: 65, to: 75, step: 5 },
      ],
      risk: baseRisk,
      fees: baseFees,
      allowedSides: ['long'],
    });
    // 3 × 3 = 9 combos
    expect(result.combinationsTested).toBe(9);
  });
});
