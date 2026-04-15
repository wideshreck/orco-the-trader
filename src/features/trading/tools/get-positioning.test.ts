import { afterEach, describe, expect, it } from 'bun:test';
import { getLongShortRatio, getOpenInterest } from './get-positioning.js';

type FetchArgs = Parameters<typeof fetch>;
const originalFetch = globalThis.fetch;

function installFetch(body: unknown, ok = true): void {
  globalThis.fetch = (async (_input: FetchArgs[0]) => {
    return {
      ok,
      status: ok ? 200 : 400,
      async json() {
        return body;
      },
      async text() {
        return JSON.stringify(body);
      },
    } as Response;
  }) as typeof fetch;
}

const ctx = { abortSignal: new AbortController().signal } as Parameters<
  typeof getOpenInterest.execute
>[1];

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('get_open_interest', () => {
  it('parses rows and computes change pct between first and last', async () => {
    installFetch([
      { symbol: 'BTCUSDT', sumOpenInterest: '100', sumOpenInterestValue: '7000000', timestamp: 1 },
      { symbol: 'BTCUSDT', sumOpenInterest: '120', sumOpenInterestValue: '8400000', timestamp: 2 },
    ]);
    const out = await getOpenInterest.execute({ symbol: 'btcusdt' }, ctx);
    expect(out.symbol).toBe('BTCUSDT');
    expect(out.count).toBe(2);
    expect(out.latest?.oi).toBe(120);
    expect(out.changePct).toBeCloseTo(20);
  });

  it('throws on non-ok response', async () => {
    installFetch({ msg: 'bad' }, false);
    await expect(getOpenInterest.execute({ symbol: 'X' }, ctx)).rejects.toThrow(/binance fapi/);
  });
});

describe('get_long_short_ratio', () => {
  it('parses ratio + percentages', async () => {
    installFetch([
      {
        symbol: 'BTCUSDT',
        longShortRatio: '2.5',
        longAccount: '0.714',
        shortAccount: '0.286',
        timestamp: 1,
      },
    ]);
    const out = await getLongShortRatio.execute({ symbol: 'BTCUSDT' }, ctx);
    expect(out.latest?.ratio).toBeCloseTo(2.5);
    expect(out.latest?.longPct).toBeCloseTo(71.4, 1);
    expect(out.latest?.shortPct).toBeCloseTo(28.6, 1);
  });
});
