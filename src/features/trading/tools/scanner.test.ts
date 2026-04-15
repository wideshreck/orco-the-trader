import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { listTopSymbols } from './list-top-symbols.js';
import { scanMarket } from './scan-market.js';

type FetchArgs = Parameters<typeof fetch>;
const originalFetch = globalThis.fetch;

function installFetch(
  handler: (url: string) => { body: unknown; ok?: boolean; status?: number },
): void {
  globalThis.fetch = (async (input: FetchArgs[0]) => {
    const url = typeof input === 'string' ? input : input.toString();
    const { body, ok = true, status = 200 } = handler(url);
    return {
      ok,
      status,
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
  typeof listTopSymbols.execute
>[1];

beforeEach(() => {});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const tickerUniverse = [
  // name, price, pct, qv, trades
  ['BTCUSDT', '70000', '2.5', '2000000000', 500000],
  ['ETHUSDT', '3500', '4.2', '800000000', 300000],
  ['SOLUSDT', '150', '-3.1', '300000000', 200000],
  ['TINYUSDT', '0.01', '20', '500', 10], // below volume floor
  ['BTCUPUSDT', '100', '5', '500000000', 10000], // leveraged, filtered
  ['DOGEBUSD', '0.1', '1', '50000000', 50000], // wrong quote
] as const;

function tickerBody(): unknown {
  return tickerUniverse.map(([symbol, lastPrice, priceChangePercent, quoteVolume, count]) => ({
    symbol,
    lastPrice,
    priceChangePercent,
    quoteVolume,
    count,
  }));
}

describe('list_top_symbols', () => {
  it('filters by quote, drops low-volume + leveraged, sorts by volume desc', async () => {
    installFetch(() => ({ body: tickerBody() }));
    const out = await listTopSymbols.execute({}, ctx);
    expect(out.quote).toBe('USDT');
    expect(out.symbols.map((r) => r.symbol)).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
    expect(out.symbols[0]?.quoteVolume).toBe(2_000_000_000);
  });

  it('sorts by gainers descending', async () => {
    installFetch(() => ({ body: tickerBody() }));
    const out = await listTopSymbols.execute({ sortBy: 'gainers', limit: 3 }, ctx);
    expect(out.symbols[0]?.symbol).toBe('ETHUSDT');
    expect(out.symbols[0]?.pct24h).toBeCloseTo(4.2);
    expect(out.symbols[1]?.symbol).toBe('BTCUSDT');
  });

  it('sorts by losers ascending', async () => {
    installFetch(() => ({ body: tickerBody() }));
    const out = await listTopSymbols.execute({ sortBy: 'losers' }, ctx);
    expect(out.symbols[0]?.symbol).toBe('SOLUSDT');
  });
});

function klineBody(closes: number[]): unknown[] {
  return closes.map((c, i) => [i, c - 0.5, c + 0.5, c - 1, c, 100, 0, 0, 0, 0, 0, 0]);
}

describe('scan_market', () => {
  it('returns one row per symbol, sorted by pct24h desc by default', async () => {
    installFetch((url) => {
      if (url.includes('/ticker/24hr')) {
        if (url.includes('symbol=BTCUSDT')) {
          return {
            body: {
              symbol: 'BTCUSDT',
              lastPrice: '70000',
              priceChangePercent: '2.5',
              quoteVolume: '2000000000',
            },
          };
        }
        return {
          body: {
            symbol: 'ETHUSDT',
            lastPrice: '3500',
            priceChangePercent: '4.2',
            quoteVolume: '800000000',
          },
        };
      }
      // klines endpoint: just return a mild ramp
      const closes = Array.from({ length: 50 }, (_, i) => 100 + i * 0.1);
      return { body: klineBody(closes) };
    });
    const out = await scanMarket.execute({ symbols: ['BTCUSDT', 'ETHUSDT'], interval: '1h' }, ctx);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]?.symbol).toBe('ETHUSDT');
    expect(out.rows[0]?.pct24h).toBeCloseTo(4.2);
    expect(out.rows[1]?.symbol).toBe('BTCUSDT');
    // RSI should be computable on a 50-candle ramp.
    expect(out.rows[0]?.rsi14).not.toBeNull();
    expect(out.rows[0]?.smaDeviationPct).not.toBeNull();
  });

  it('does not throw if a symbol returns non-ok — row still present with NaN fields', async () => {
    installFetch((url) => {
      if (url.includes('/ticker/24hr') && url.includes('BADUSDT')) {
        return { body: { code: -1121, msg: 'bad' }, ok: false, status: 400 };
      }
      if (url.includes('/ticker/24hr')) {
        return {
          body: {
            symbol: 'BTCUSDT',
            lastPrice: '70000',
            priceChangePercent: '2.5',
            quoteVolume: '1000000000',
          },
        };
      }
      if (url.includes('BADUSDT')) {
        return { body: { code: -1121 }, ok: false, status: 400 };
      }
      const closes = Array.from({ length: 50 }, (_, i) => 100 + i * 0.1);
      return { body: klineBody(closes) };
    });
    const out = await scanMarket.execute({ symbols: ['BTCUSDT', 'BADUSDT'], interval: '1h' }, ctx);
    expect(out.rows).toHaveLength(2);
    const bad = out.rows.find((r) => r.symbol === 'BADUSDT');
    expect(bad).toBeDefined();
    if (!bad) return;
    expect(Number.isNaN(bad.last)).toBe(true);
    expect(bad.rsi14).toBeNull();
  });
});
