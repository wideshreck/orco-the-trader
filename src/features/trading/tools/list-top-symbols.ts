import { z } from 'zod';
import { defineTool } from '../../tools/define.js';

type Raw = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  count: number;
};

const sortByEnum = z.enum(['volume', 'gainers', 'losers', 'trades']);

export const listTopSymbols = defineTool({
  name: 'list_top_symbols',
  description: [
    'List top Binance spot symbols ranked by 24h quote volume, gainers,',
    'losers, or trade count. One request — cheap enough to call at the',
    'start of a scan. Filter by quote asset (default USDT).',
    '',
    'sortBy:',
    '  volume  — descending 24h quoteVolume (default)',
    '  gainers — descending priceChangePercent',
    '  losers  — ascending priceChangePercent',
    '  trades  — descending trade count (activity proxy)',
    '',
    'Use the returned symbols as input to `scan_market` or `get_ohlcv`.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    quote: z.string().optional().describe('Quote asset suffix, uppercase. Default USDT'),
    sortBy: sortByEnum.optional(),
    limit: z.number().int().min(1).max(100).optional().describe('Default 20'),
    minQuoteVolume: z
      .number()
      .optional()
      .describe('Drop symbols below this 24h quote volume (USDT). Default 1_000_000'),
  }),
  async execute(input, ctx) {
    const quote = (input.quote ?? 'USDT').toUpperCase();
    const sortBy = input.sortBy ?? 'volume';
    const limit = input.limit ?? 20;
    const minVol = input.minQuoteVolume ?? 1_000_000;

    const url = 'https://api.binance.com/api/v3/ticker/24hr';
    const res = await fetch(url, { signal: ctx.abortSignal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`binance ${res.status}: ${body.slice(0, 200)}`);
    }
    const raw = (await res.json()) as Raw[];
    const rows = raw
      .filter((r) => r.symbol.endsWith(quote))
      // Skip leveraged tokens and common wrap suffixes — noisy, not tradable as usual.
      .filter((r) => !/(UP|DOWN|BULL|BEAR)USDT$/.test(r.symbol))
      .map((r) => ({
        symbol: r.symbol,
        lastPrice: Number(r.lastPrice),
        pct24h: Number(r.priceChangePercent),
        quoteVolume: Number(r.quoteVolume),
        trades: r.count,
      }))
      .filter((r) => Number.isFinite(r.quoteVolume) && r.quoteVolume >= minVol);

    rows.sort((a, b) => {
      switch (sortBy) {
        case 'gainers':
          return b.pct24h - a.pct24h;
        case 'losers':
          return a.pct24h - b.pct24h;
        case 'trades':
          return b.trades - a.trades;
        default:
          return b.quoteVolume - a.quoteVolume;
      }
    });

    return {
      quote,
      sortBy,
      count: Math.min(rows.length, limit),
      symbols: rows.slice(0, limit),
    };
  },
});
