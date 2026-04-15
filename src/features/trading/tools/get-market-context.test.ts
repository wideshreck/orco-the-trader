import { afterEach, describe, expect, it } from 'bun:test';
import { getMarketContext } from './get-market-context.js';

type FetchArgs = Parameters<typeof fetch>;
const originalFetch = globalThis.fetch;

function installFetch(handler: (url: string) => { body: unknown; ok?: boolean } | 'throw'): void {
  globalThis.fetch = (async (input: FetchArgs[0]) => {
    const url = typeof input === 'string' ? input : input.toString();
    const result = handler(url);
    if (result === 'throw') throw new Error('network');
    const { body, ok = true } = result;
    return {
      ok,
      status: ok ? 200 : 500,
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
  typeof getMarketContext.execute
>[1];

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('get_market_context', () => {
  it('combines fear-greed and coingecko global into curated fields', async () => {
    installFetch((url) => {
      if (url.includes('alternative.me')) {
        return {
          body: {
            data: [{ value: '72', value_classification: 'Greed', timestamp: '1700000000' }],
          },
        };
      }
      return {
        body: {
          data: {
            total_market_cap: { usd: 2_500_000_000_000 },
            total_volume: { usd: 120_000_000_000 },
            market_cap_percentage: { btc: 52.1, eth: 17.3 },
            market_cap_change_percentage_24h_usd: 1.4,
          },
        },
      };
    });
    const out = await getMarketContext.execute({}, ctx);
    expect(out.fearGreed?.value).toBe(72);
    expect(out.fearGreed?.label).toBe('Greed');
    expect(out.totalMarketCapUsd).toBe(2_500_000_000_000);
    expect(out.btcDominancePct).toBeCloseTo(52.1);
    expect(out.ethDominancePct).toBeCloseTo(17.3);
    expect(out.marketCapChange24hPct).toBeCloseTo(1.4);
  });

  it('returns nulls where a source fails instead of throwing', async () => {
    installFetch((url) => {
      if (url.includes('alternative.me')) return 'throw';
      return {
        body: {
          data: {
            total_market_cap: { usd: 1 },
            market_cap_percentage: { btc: 50 },
          },
        },
      };
    });
    const out = await getMarketContext.execute({}, ctx);
    expect(out.fearGreed).toBeNull();
    expect(out.btcDominancePct).toBe(50);
    expect(out.ethDominancePct).toBeNull();
  });
});
