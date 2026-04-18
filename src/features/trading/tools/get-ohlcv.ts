import { z } from 'zod';
import { defineTool } from '../../tools/define.js';
import { type Candle, fetchKlines, INTERVALS } from '../binance.js';

export type { Candle } from '../binance.js';

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
    const candles: Candle[] = await fetchKlines({
      symbol,
      interval: input.interval,
      limit,
      signal: ctx.abortSignal,
    });
    if (candles.length === 0) {
      throw new Error(`no candles returned for ${symbol} ${input.interval}`);
    }
    return { symbol, interval: input.interval, count: candles.length, candles };
  },
});
