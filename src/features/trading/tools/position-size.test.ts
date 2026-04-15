import { describe, expect, it } from 'bun:test';
import { positionSize } from './position-size.js';

const ctx = { abortSignal: new AbortController().signal } as Parameters<
  typeof positionSize.execute
>[1];

describe('position_size', () => {
  it('long: $10k × 1% = $100 risk, stop 1% below = 100 notional per unit', async () => {
    const out = await positionSize.execute(
      { balance: 10000, riskPct: 1, entry: 100, stopLoss: 99 },
      ctx,
    );
    expect(out.side).toBe('long');
    expect(out.riskAmount).toBe(100);
    expect(out.stopDistance).toBe(1);
    expect(out.qty).toBe(100);
    expect(out.notional).toBe(10000);
    expect(out.marginRequired).toBe(10000); // leverage 1
  });

  it('short: rejects stop below entry', async () => {
    await expect(
      positionSize.execute(
        { balance: 1000, riskPct: 1, entry: 100, stopLoss: 99, side: 'short' },
        ctx,
      ),
    ).rejects.toThrow(/stopLoss above entry/);
  });

  it('computes R:R when takeProfit is provided', async () => {
    const out = await positionSize.execute(
      { balance: 10000, riskPct: 1, entry: 100, stopLoss: 99, takeProfit: 103 },
      ctx,
    );
    expect(out.rr).toBe(3);
    expect(out.rewardAmount).toBe(300);
  });

  it('respects leverage on marginRequired', async () => {
    const out = await positionSize.execute(
      { balance: 1000, riskPct: 1, entry: 100, stopLoss: 99, leverage: 10 },
      ctx,
    );
    expect(out.notional).toBe(1000);
    expect(out.marginRequired).toBe(100);
  });

  it('rejects wrong-side takeProfit', async () => {
    await expect(
      positionSize.execute(
        { balance: 1000, riskPct: 1, entry: 100, stopLoss: 99, takeProfit: 98 },
        ctx,
      ),
    ).rejects.toThrow(/takeProfit is on the wrong side/);
  });

  it('rejects zero stop distance', async () => {
    await expect(
      positionSize.execute({ balance: 1000, riskPct: 1, entry: 100, stopLoss: 100 }, ctx),
    ).rejects.toThrow(/stop distance is zero/);
  });
});
