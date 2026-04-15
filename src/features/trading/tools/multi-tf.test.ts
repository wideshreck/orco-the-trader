import { afterEach, describe, expect, it } from 'bun:test';
import { multiTimeframeAnalysis } from './multi-tf.js';

type FetchArgs = Parameters<typeof fetch>;
const originalFetch = globalThis.fetch;

function installFetch(handler: (url: string) => unknown): void {
  globalThis.fetch = (async (input: FetchArgs[0]) => {
    const url = typeof input === 'string' ? input : input.toString();
    const body = handler(url);
    return {
      ok: true,
      status: 200,
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
  typeof multiTimeframeAnalysis.execute
>[1];

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function klines(closes: number[]): unknown[] {
  // [t, o, h, l, c, v, …]
  return closes.map((c, i) => [i * 60000, c - 0.5, c + 0.5, c - 1, c, 100, 0, 0, 0, 0, 0, 0]);
}

describe('multi_timeframe_analysis', () => {
  it('flags alignment bullish when every timeframe trends up', async () => {
    // Strong uptrend: 200 candles ramping up.
    const closes = Array.from({ length: 200 }, (_, i) => 100 + i * 0.5);
    installFetch(() => klines(closes));
    const out = await multiTimeframeAnalysis.execute({ symbol: 'btcusdt' }, ctx);
    expect(out.symbol).toBe('BTCUSDT');
    expect(out.intervals).toEqual(['1h', '4h', '1d']);
    expect(out.alignment.dominant).toBe('bullish');
    expect(out.alignment.aligned).toBe(true);
    for (const row of out.rows) {
      expect(row.trend).toBe('bullish');
    }
  });

  it('flags bearish alignment on a downtrend', async () => {
    const closes = Array.from({ length: 200 }, (_, i) => 200 - i * 0.5);
    installFetch(() => klines(closes));
    const out = await multiTimeframeAnalysis.execute(
      { symbol: 'BTCUSDT', intervals: ['1h', '4h'] },
      ctx,
    );
    expect(out.alignment.dominant).toBe('bearish');
    expect(out.alignment.bearish).toBe(2);
  });

  it('returns shape-valid results on a flat range', async () => {
    // Flat-ish series: biases can vary due to float noise in MACD / RSI, so
    // just assert structural integrity — not a specific bias.
    const closes = Array.from({ length: 200 }, (_, i) => 100 + (i % 2 === 0 ? 0.1 : -0.1));
    installFetch(() => klines(closes));
    const out = await multiTimeframeAnalysis.execute(
      { symbol: 'BTCUSDT', intervals: ['1h', '4h', '1d'] },
      ctx,
    );
    expect(out.rows).toHaveLength(3);
    expect(out.alignment.bullish + out.alignment.bearish + out.alignment.neutral).toBe(3);
    expect(out.alignment.pct).toBeGreaterThanOrEqual(0);
    expect(out.alignment.pct).toBeLessThanOrEqual(100);
  });
});
