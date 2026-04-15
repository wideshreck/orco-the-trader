import { z } from 'zod';
import { defineTool } from '../../tools/define.js';
import type { Candle } from './get-ohlcv.js';
import { atr, ema, macd, rsi, sma } from './indicators.js';

const indicatorName = z.enum([
  'sma20',
  'sma50',
  'sma200',
  'ema12',
  'ema26',
  'rsi14',
  'macd',
  'atr14',
]);

const candleSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number(),
});

export const computeIndicators = defineTool({
  name: 'compute_indicators',
  description: [
    'Compute technical indicators from an OHLCV candle series (as returned by',
    'get_ohlcv). Offload numeric work to this tool rather than guessing values.',
    '',
    'Pick any subset of indicators:',
    '  sma20, sma50, sma200 — simple moving averages',
    '  ema12, ema26 — exponential moving averages',
    '  rsi14 — Wilder RSI over 14 periods',
    '  macd — MACD(12,26,9), returns {macd, signal, histogram}',
    '  atr14 — Average True Range(14), volatility in price units',
    '',
    'Returns null for any indicator that requires more history than the series',
    'provides. Always evaluate null before citing a number.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    candles: z.array(candleSchema).min(2).describe('OHLCV series from get_ohlcv'),
    indicators: z.array(indicatorName).min(1).describe('Which indicators to compute'),
  }),
  async execute(input) {
    const candles = input.candles as Candle[];
    const out: Record<string, unknown> = {};
    for (const name of input.indicators) {
      switch (name) {
        case 'sma20':
          out.sma20 = sma(candles, 20);
          break;
        case 'sma50':
          out.sma50 = sma(candles, 50);
          break;
        case 'sma200':
          out.sma200 = sma(candles, 200);
          break;
        case 'ema12':
          out.ema12 = ema(candles, 12);
          break;
        case 'ema26':
          out.ema26 = ema(candles, 26);
          break;
        case 'rsi14':
          out.rsi14 = rsi(candles, 14);
          break;
        case 'macd':
          out.macd = macd(candles);
          break;
        case 'atr14':
          out.atr14 = atr(candles, 14);
          break;
      }
    }
    const last = candles[candles.length - 1];
    return {
      last: last ? { t: last.t, c: last.c } : null,
      indicators: out,
    };
  },
});
