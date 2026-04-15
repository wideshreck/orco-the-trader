import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { getFundingRate } from './get-funding-rate.js';
import { getOrderBook } from './get-order-book.js';
import { getTicker24h } from './get-ticker-24h.js';

type FetchArgs = Parameters<typeof fetch>;
const originalFetch = globalThis.fetch;
let lastUrl = '';

function mockFetch(body: unknown, ok = true, status = 200): void {
  globalThis.fetch = (async (input: FetchArgs[0]) => {
    lastUrl = typeof input === 'string' ? input : input.toString();
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
  typeof getTicker24h.execute
>[1];

beforeEach(() => {
  lastUrl = '';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('get_ticker_24h', () => {
  it('parses and curates ticker fields', async () => {
    mockFetch({
      lastPrice: '75000.50',
      priceChange: '-284.12',
      priceChangePercent: '-0.38',
      highPrice: '76000',
      lowPrice: '74000',
      openPrice: '75284.62',
      weightedAvgPrice: '75100',
      volume: '1234.5',
      quoteVolume: '92750000',
      count: 100000,
    });
    const out = await getTicker24h.execute({ symbol: 'btcusdt' }, ctx);
    expect(out.symbol).toBe('BTCUSDT');
    expect(out.lastPrice).toBe(75000.5);
    expect(out.priceChangePercent).toBeCloseTo(-0.38);
    expect(out.quoteVolume).toBe(92_750_000);
    expect(out.trades).toBe(100000);
    expect(lastUrl).toContain('BTCUSDT');
  });

  it('throws on non-ok response', async () => {
    mockFetch({ code: -1121, msg: 'Invalid symbol' }, false, 400);
    await expect(getTicker24h.execute({ symbol: 'FAKEUSDT' }, ctx)).rejects.toThrow(/binance 400/);
  });
});

describe('get_order_book', () => {
  it('returns curated summary with cumulative totals and imbalance', async () => {
    mockFetch({
      lastUpdateId: 999,
      bids: [
        ['100', '2'],
        ['99', '3'],
      ],
      asks: [
        ['101', '1'],
        ['102', '2'],
      ],
    });
    const out = await getOrderBook.execute({ symbol: 'BTCUSDT', limit: 5 }, ctx);
    expect(out.bestBid).toBe(100);
    expect(out.bestAsk).toBe(101);
    expect(out.spread).toBe(1);
    expect(out.mid).toBe(100.5);
    // bidQuote = 100*2 + 99*3 = 497
    // askQuote = 101*1 + 102*2 = 305
    expect(out.bidQuote).toBeCloseTo(497);
    expect(out.askQuote).toBeCloseTo(305);
    expect(out.imbalance).toBeCloseTo(497 / (497 + 305));
    expect(out.bids[1]?.cumQty).toBe(5);
    expect(out.asks[1]?.cumQty).toBe(3);
  });

  it('throws on empty book', async () => {
    mockFetch({ lastUpdateId: 1, bids: [], asks: [] });
    await expect(getOrderBook.execute({ symbol: 'BTCUSDT' }, ctx)).rejects.toThrow(/empty/);
  });
});

describe('get_funding_rate', () => {
  it('parses rate and converts to percent', async () => {
    mockFetch({
      symbol: 'BTCUSDT',
      markPrice: '75000.1',
      indexPrice: '75000.0',
      lastFundingRate: '0.0001',
      nextFundingTime: 1_700_000_000_000,
      time: 1_699_999_000_000,
    });
    const out = await getFundingRate.execute({ symbol: 'btcusdt' }, ctx);
    expect(out.symbol).toBe('BTCUSDT');
    expect(out.lastFundingRate).toBeCloseTo(0.0001);
    expect(out.lastFundingRatePct).toBeCloseTo(0.01);
    expect(lastUrl).toContain('fapi.binance.com');
  });

  it('throws on non-ok response', async () => {
    mockFetch({ code: -1121, msg: 'Invalid symbol' }, false, 400);
    await expect(getFundingRate.execute({ symbol: 'WEIRDUSDT' }, ctx)).rejects.toThrow(
      /binance fapi 400/,
    );
  });
});
