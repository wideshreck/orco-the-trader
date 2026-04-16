import { describe, expect, it } from 'bun:test';
import { computeMetrics } from './metrics.js';
import type { Bar, EquityPoint, Trade } from './types.js';

function bar(t: number, c: number): Bar {
  return { t, o: c, h: c, l: c, c, v: 0 };
}

function trade(pnl: number, rMultiple = pnl / 100, barsHeld = 10): Trade {
  return {
    side: 'long',
    entryT: 0,
    exitT: barsHeld * 60_000,
    entryPrice: 100,
    exitPrice: 100 + pnl,
    qty: 1,
    stopPrice: 99,
    takeProfitPrice: 102,
    pnl,
    pnlPct: pnl / 100,
    rMultiple,
    reason: 'signal',
    barsHeld,
    fees: 0,
  };
}

describe('metrics', () => {
  it('reports total return, drawdown, and profit factor on a simple equity curve', () => {
    const bars: Bar[] = [bar(0, 100), bar(60_000, 100), bar(120_000, 100), bar(180_000, 100)];
    const equity: EquityPoint[] = [
      { t: 0, equity: 10_000 },
      { t: 60_000, equity: 10_500 },
      { t: 120_000, equity: 10_200 },
      { t: 180_000, equity: 11_000 },
    ];
    const trades: Trade[] = [trade(500), trade(-300), trade(800)];
    const m = computeMetrics(bars, equity, trades, 10_000);
    expect(m.totalReturnPct).toBeCloseTo(10);
    expect(m.finalBalance).toBe(11_000);
    expect(m.trades).toBe(3);
    expect(m.wins).toBe(2);
    expect(m.losses).toBe(1);
    expect(m.winRatePct).toBeCloseTo((2 / 3) * 100);
    expect(m.profitFactor).toBeCloseTo((500 + 800) / 300);
    expect(m.maxDrawdownPct).toBeCloseTo((300 / 10_500) * 100);
  });

  it('handles zero trades without throwing', () => {
    const bars: Bar[] = [bar(0, 100), bar(60_000, 100)];
    const equity: EquityPoint[] = [
      { t: 0, equity: 10_000 },
      { t: 60_000, equity: 10_000 },
    ];
    const m = computeMetrics(bars, equity, [], 10_000);
    expect(m.trades).toBe(0);
    expect(m.winRatePct).toBe(0);
    expect(m.profitFactor).toBeNull();
    expect(m.expectancy).toBe(0);
    expect(m.totalReturnPct).toBe(0);
  });

  it('computes buy-and-hold benchmark', () => {
    const bars: Bar[] = [bar(0, 100), bar(60_000, 110), bar(120_000, 120)];
    const equity: EquityPoint[] = [
      { t: 0, equity: 10_000 },
      { t: 60_000, equity: 10_000 },
      { t: 120_000, equity: 10_000 },
    ];
    const m = computeMetrics(bars, equity, [], 10_000);
    expect(m.buyHoldReturnPct).toBeCloseTo(20);
  });
});
