import { describe, expect, it } from 'bun:test';
import { runBacktest } from './engine.js';
import { findPreset } from './presets/index.js';
import type { Bar } from './types.js';

function mkBars(closes: number[], range = 1): Bar[] {
  return closes.map((c, i) => ({
    t: i * 60_000,
    o: c,
    h: c + range,
    l: c - range,
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

describe('engine', () => {
  it('makes no trades when indicators never fire', () => {
    const bars = mkBars(Array.from({ length: 200 }, () => 100));
    const strat = findPreset('rsi_reversal');
    if (!strat) throw new Error('preset missing');
    const res = runBacktest({
      bars,
      strategy: strat,
      params: strat.defaults,
      risk: baseRisk,
      fees: baseFees,
      allowedSides: ['long', 'short'],
    });
    expect(res.trades.length).toBe(0);
    expect(res.metrics.finalBalance).toBe(baseRisk.initialBalance);
    expect(res.metrics.totalReturnPct).toBe(0);
  });

  it('ma_crossover trades on a series with a real crossover', () => {
    // Declining then rising series → fast will cross above slow eventually.
    const down = Array.from({ length: 60 }, (_, i) => 100 - i * 0.5);
    const up = Array.from({ length: 120 }, (_, i) => 70 + i * 0.5);
    const bars = mkBars([...down, ...up]);
    const strat = findPreset('ma_crossover');
    if (!strat) throw new Error('preset missing');
    const res = runBacktest({
      bars,
      strategy: strat,
      params: strat.defaults,
      risk: baseRisk,
      fees: baseFees,
      allowedSides: ['long', 'short'],
    });
    expect(res.trades.length).toBeGreaterThan(0);
  });

  it('respects allowedSides=[long] and never opens a short', () => {
    // Alternating spike series likely to trigger short entries if allowed.
    const closes = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const bars = mkBars(closes, 0.5);
    const strat = findPreset('rsi_reversal');
    if (!strat) throw new Error('preset missing');
    const res = runBacktest({
      bars,
      strategy: strat,
      params: { ...strat.defaults, oversold: 45, overbought: 55 },
      risk: baseRisk,
      fees: baseFees,
      allowedSides: ['long'],
    });
    for (const t of res.trades) {
      expect(t.side).toBe('long');
    }
  });

  it('donchian_breakout triggers on a clean breakout series', () => {
    // Flat range then breakout upward.
    const flat = Array.from({ length: 60 }, () => 100);
    const breakout = Array.from({ length: 40 }, (_, i) => 101 + i);
    const bars = mkBars([...flat, ...breakout], 0.5);
    const strat = findPreset('donchian_breakout');
    if (!strat) throw new Error('preset missing');
    const res = runBacktest({
      bars,
      strategy: strat,
      params: { entry: 20, exit: 10 },
      risk: baseRisk,
      fees: baseFees,
      allowedSides: ['long', 'short'],
    });
    expect(res.trades.some((t) => t.side === 'long')).toBe(true);
  });

  it('fills at next bar open (no look-ahead)', () => {
    // Construct a bar that would satisfy an entry trigger on close; verify
    // the trade's entryPrice equals NEXT bar's open × (1 + slippage).
    const bars: Bar[] = [];
    for (let i = 0; i < 30; i++) bars.push({ t: i * 60_000, o: 100, h: 101, l: 99, c: 100, v: 1 });
    // Force a donchian long breakout at bar 30: close above prior 20-bar high.
    bars.push({ t: 30 * 60_000, o: 101, h: 102, l: 100, c: 102, v: 1 });
    // The next bar is where the entry should fill:
    bars.push({ t: 31 * 60_000, o: 105, h: 106, l: 104, c: 105, v: 1 });
    // Keep going so exit logic has room.
    for (let i = 32; i < 80; i++) {
      bars.push({ t: i * 60_000, o: 105, h: 106, l: 104, c: 105, v: 1 });
    }
    const strat = findPreset('donchian_breakout');
    if (!strat) throw new Error('preset missing');
    const res = runBacktest({
      bars,
      strategy: strat,
      params: { entry: 20, exit: 10 },
      risk: baseRisk,
      fees: baseFees,
      allowedSides: ['long'],
    });
    expect(res.trades.length).toBeGreaterThan(0);
    const first = res.trades[0];
    if (!first) return;
    // Slippage bps 2 = 0.02% → entryPrice > 105
    expect(first.entryPrice).toBeGreaterThan(105);
    expect(first.entryPrice).toBeLessThan(105 * 1.01);
  });
});
