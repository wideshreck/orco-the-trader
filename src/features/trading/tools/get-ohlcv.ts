import { z } from 'zod';
import { defineTool } from '../../tools/define.js';

const INTERVALS = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w'] as const;

export type Candle = {
  t: number; // open time (ms since epoch)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

function parseKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  const out: Candle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const t = Number(row[0]);
    const o = Number(row[1]);
    const h = Number(row[2]);
    const l = Number(row[3]);
    const c = Number(row[4]);
    const v = Number(row[5]);
    if (!Number.isFinite(t + o + h + l + c + v)) continue;
    out.push({ t, o, h, l, c, v });
  }
  return out;
}

export const getOhlcv = defineTool({
  name: 'get_ohlcv',
  description: [
    'Fetch OHLCV candlestick data from Binance public API.',
    '',
    'Symbols use Binance spot format (uppercase): BTCUSDT, ETHUSDT, SOLUSDT, etc.',
    'When the user says "BTC/USD" or "BTC/USDT" translate to "BTCUSDT".',
    '',
    'Intervals: 1m 5m 15m 30m 1h 2h 4h 6h 12h 1d 1w',
    'Guidance — pick per user timeframe:',
    '  scalp → 1m/5m · intraday → 15m/1h · swing → 4h/1d · position → 1d/1w',
    '',
    'Returns up to `limit` most-recent candles (default 100, max 1000). Each',
    'candle: { t: open-time-ms, o, h, l, c, v }.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    symbol: z.string().describe('Binance spot pair, uppercase, e.g. BTCUSDT'),
    interval: z.enum(INTERVALS).describe('Candle interval'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of candles to return (default 100)'),
  }),
  async execute(input, ctx) {
    const limit = input.limit ?? 100;
    const symbol = input.symbol.toUpperCase();
    const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${input.interval}&limit=${limit}`;
    const res = await fetch(url, { signal: ctx.abortSignal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`binance ${res.status}: ${body.slice(0, 200)}`);
    }
    const raw = (await res.json()) as unknown;
    const candles = parseKlines(raw);
    if (candles.length === 0) {
      throw new Error(`no candles returned for ${symbol} ${input.interval}`);
    }
    return { symbol, interval: input.interval, count: candles.length, candles };
  },
});
