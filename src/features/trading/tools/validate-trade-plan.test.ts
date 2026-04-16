import { describe, expect, it } from 'bun:test';
import { validateTradePlan } from './validate-trade-plan.js';

const ctx = { abortSignal: new AbortController().signal } as Parameters<
  typeof validateTradePlan.execute
>[1];

describe('validate_trade_plan', () => {
  it('ok when plan is consistent and R:R passes minRR', async () => {
    const out = await validateTradePlan.execute(
      { side: 'long', entry: 100, stopLoss: 99, takeProfit: 103 },
      ctx,
    );
    expect(out.verdict).toBe('ok');
    expect(out.rr).toBe(3);
    expect(out.issues).toEqual([]);
  });

  it('invalid when long stop is above entry', async () => {
    const out = await validateTradePlan.execute(
      { side: 'long', entry: 100, stopLoss: 101, takeProfit: 103 },
      ctx,
    );
    expect(out.verdict).toBe('invalid');
    expect(out.issues.some((i) => i.level === 'error' && /stopLoss/.test(i.message))).toBe(true);
  });

  it('invalid when short takeProfit is above entry', async () => {
    const out = await validateTradePlan.execute(
      { side: 'short', entry: 100, stopLoss: 101, takeProfit: 105 },
      ctx,
    );
    expect(out.verdict).toBe('invalid');
  });

  it('warnings when R:R is below minRR', async () => {
    const out = await validateTradePlan.execute(
      { side: 'long', entry: 100, stopLoss: 99, takeProfit: 100.5, minRR: 1.5 },
      ctx,
    );
    expect(out.verdict).toBe('warnings');
    expect(out.issues[0]?.message).toContain('R:R');
  });

  it('flags tight stop when stopAtrMult < 0.75', async () => {
    const out = await validateTradePlan.execute(
      { side: 'long', entry: 100, stopLoss: 99.8, takeProfit: 100.5, atr: 1 },
      ctx,
    );
    expect(out.issues.some((i) => /tight/.test(i.message))).toBe(true);
  });

  it('flags chasing when long entry is far below current price', async () => {
    const out = await validateTradePlan.execute(
      {
        side: 'long',
        entry: 100,
        stopLoss: 99,
        takeProfit: 103,
        currentPrice: 110,
        maxEntryGapPct: 2,
      },
      ctx,
    );
    expect(out.issues.some((i) => /chasing/.test(i.message))).toBe(true);
  });
});
