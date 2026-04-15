import { z } from 'zod';
import { defineTool } from '../../tools/define.js';

type Raw = {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  time: number;
};

export const getFundingRate = defineTool({
  name: 'get_funding_rate',
  description: [
    'Fetch the current perpetual-futures funding rate and mark/index price',
    'from Binance USDT-M futures (fapi) for one symbol.',
    '',
    'Funding rate is a sentiment proxy: positive → longs pay shorts (crowded',
    'long), negative → shorts pay longs (crowded short). Typical range',
    '±0.01% per 8h; |rate| > 0.05% is extreme and often mean-reverts.',
    '',
    'Returns: markPrice, indexPrice, lastFundingRate (decimal, e.g. 0.0001),',
    'lastFundingRatePct (same × 100), nextFundingTime (ms epoch).',
    '',
    'Symbol format: BTCUSDT, ETHUSDT (same as spot). Not all spot pairs have',
    'a perp — if the symbol is unknown to fapi the call fails.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    symbol: z.string().describe('Perp symbol, uppercase, e.g. BTCUSDT'),
  }),
  async execute(input, ctx) {
    const symbol = input.symbol.toUpperCase();
    const url = `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { signal: ctx.abortSignal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`binance fapi ${res.status}: ${body.slice(0, 200)}`);
    }
    const raw = (await res.json()) as Raw;
    const rate = Number(raw.lastFundingRate);
    return {
      symbol: raw.symbol,
      markPrice: Number(raw.markPrice),
      indexPrice: Number(raw.indexPrice),
      lastFundingRate: rate,
      lastFundingRatePct: rate * 100,
      nextFundingTime: raw.nextFundingTime,
      time: raw.time,
    };
  },
});
