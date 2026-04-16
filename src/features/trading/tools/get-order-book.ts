import { z } from 'zod';
import { defineTool } from '../../tools/define.js';

const DEPTH_LIMITS: readonly number[] = [5, 10, 20, 50, 100, 500, 1000];

type RawLevel = [string, string];
type Raw = { lastUpdateId: number; bids: RawLevel[]; asks: RawLevel[] };

type Level = { price: number; qty: number; cumQty: number; cumQuote: number };

function parseSide(rows: RawLevel[]): Level[] {
  const out: Level[] = [];
  let cumQty = 0;
  let cumQuote = 0;
  for (const row of rows) {
    const price = Number(row[0]);
    const qty = Number(row[1]);
    if (!Number.isFinite(price) || !Number.isFinite(qty)) continue;
    cumQty += qty;
    cumQuote += price * qty;
    out.push({ price, qty, cumQty, cumQuote });
  }
  return out;
}

export const getOrderBook = defineTool({
  name: 'get_order_book',
  description: [
    'Fetch spot order book depth from Binance and return a curated summary.',
    '',
    'Returns: best bid/ask, mid price, absolute + relative spread, total',
    'bid/ask quantity (base) and notional (quote USDT), imbalance ratio',
    '(bidQuote / (bidQuote + askQuote), 0.5 = balanced), and the top-N',
    'levels each side with cumulative quantity and notional.',
    '',
    'Use to gauge short-term supply/demand and detect walls. Allowed',
    'depth values: 5 10 20 50 100 500 1000. Default 20.',
    '',
    'Symbol format: BTCUSDT, ETHUSDT (uppercase spot pair).',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    symbol: z.string().describe('Binance spot pair, uppercase'),
    limit: z
      .number()
      .int()
      .optional()
      .describe('Depth levels per side. Allowed: 5, 10, 20, 50, 100, 500, 1000. Default 20'),
  }),
  async execute(input, ctx) {
    const symbol = input.symbol.toUpperCase();
    const limit = input.limit ?? 20;
    if (!DEPTH_LIMITS.includes(limit)) {
      throw new Error(`invalid depth limit ${limit}`);
    }
    const url = `https://api.binance.com/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
    const res = await fetch(url, { signal: ctx.abortSignal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`binance ${res.status}: ${body.slice(0, 200)}`);
    }
    const raw = (await res.json()) as Raw;
    const bids = parseSide(raw.bids);
    const asks = parseSide(raw.asks);
    if (bids.length === 0 || asks.length === 0) {
      throw new Error(`empty order book for ${symbol}`);
    }
    const bestBid = bids[0];
    const bestAsk = asks[0];
    if (!bestBid || !bestAsk) throw new Error(`empty order book for ${symbol}`);
    const spread = bestAsk.price - bestBid.price;
    const mid = (bestAsk.price + bestBid.price) / 2;
    const bidQuote = bids[bids.length - 1]?.cumQuote ?? 0;
    const askQuote = asks[asks.length - 1]?.cumQuote ?? 0;
    const bidQty = bids[bids.length - 1]?.cumQty ?? 0;
    const askQty = asks[asks.length - 1]?.cumQty ?? 0;
    const totalQuote = bidQuote + askQuote;
    const imbalance = totalQuote > 0 ? bidQuote / totalQuote : 0.5;
    return {
      symbol,
      lastUpdateId: raw.lastUpdateId,
      bestBid: bestBid.price,
      bestAsk: bestAsk.price,
      mid,
      spread,
      spreadPct: mid > 0 ? (spread / mid) * 100 : 0,
      bidQty,
      askQty,
      bidQuote,
      askQuote,
      imbalance,
      bids,
      asks,
    };
  },
});
