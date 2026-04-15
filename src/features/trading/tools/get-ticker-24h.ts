import { z } from 'zod';
import { defineTool } from '../../tools/define.js';

type Raw = {
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  openPrice: string;
  weightedAvgPrice: string;
  volume: string;
  quoteVolume: string;
  count: number;
};

export const getTicker24h = defineTool({
  name: 'get_ticker_24h',
  description: [
    'Fetch 24-hour rolling ticker stats from Binance spot for one symbol.',
    '',
    'Returns: last price, 24h change (abs + %), 24h high/low, open price,',
    'volume-weighted average, base-asset volume, quote-asset volume (USDT),',
    'and trade count. Use this before deciding whether a symbol is worth',
    'deeper analysis — low quoteVolume means thin liquidity.',
    '',
    'Symbol format: BTCUSDT, ETHUSDT, SOLUSDT (uppercase, no slash).',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    symbol: z.string().describe('Binance spot pair, uppercase, e.g. BTCUSDT'),
  }),
  async execute(input, ctx) {
    const symbol = input.symbol.toUpperCase();
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { signal: ctx.abortSignal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`binance ${res.status}: ${body.slice(0, 200)}`);
    }
    const raw = (await res.json()) as Raw;
    return {
      symbol,
      lastPrice: Number(raw.lastPrice),
      priceChange: Number(raw.priceChange),
      priceChangePercent: Number(raw.priceChangePercent),
      high24h: Number(raw.highPrice),
      low24h: Number(raw.lowPrice),
      openPrice: Number(raw.openPrice),
      weightedAvgPrice: Number(raw.weightedAvgPrice),
      volume: Number(raw.volume),
      quoteVolume: Number(raw.quoteVolume),
      trades: raw.count,
    };
  },
});
