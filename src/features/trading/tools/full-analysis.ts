import { z } from 'zod';
import { defineTool } from '../../tools/define.js';
import { computeIndicators } from './compute-indicators.js';
import { detectDivergence } from './detect-divergence.js';
import { detectSupportResistance } from './detect-sr.js';
import { getFundingRate } from './get-funding-rate.js';
import { getMarketContext } from './get-market-context.js';
import { getOhlcv } from './get-ohlcv.js';
import { getOrderBook } from './get-order-book.js';
import { getTicker24h } from './get-ticker-24h.js';
import { multiTimeframeAnalysis } from './multi-tf.js';

const INTERVALS = ['15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'] as const;
type Interval = (typeof INTERVALS)[number];

const MTF_BY_INTERVAL: Record<Interval, readonly Interval[]> = {
  '15m': ['15m', '1h', '4h'],
  '30m': ['30m', '2h', '1d'],
  '1h': ['1h', '4h', '1d'],
  '2h': ['2h', '6h', '1d'],
  '4h': ['4h', '12h', '1d'],
  '6h': ['6h', '1d'],
  '12h': ['12h', '1d'],
  '1d': ['4h', '1d'],
};

function adxVerdict(adx: number | null): 'strong' | 'developing' | 'weak' | 'unknown' {
  if (adx === null) return 'unknown';
  if (adx >= 25) return 'strong';
  if (adx >= 20) return 'developing';
  return 'weak';
}

function stackBias(
  last: number,
  sma20: number | null,
  sma50: number | null,
  sma200: number | null,
): 'bullish' | 'bearish' | 'mixed' | 'unknown' {
  if (sma20 === null || sma50 === null) return 'unknown';
  if (sma200 !== null) {
    if (last > sma20 && sma20 > sma50 && sma50 > sma200) return 'bullish';
    if (last < sma20 && sma20 < sma50 && sma50 < sma200) return 'bearish';
  } else {
    if (last > sma20 && sma20 > sma50) return 'bullish';
    if (last < sma20 && sma20 < sma50) return 'bearish';
  }
  return 'mixed';
}

export const fullAnalysis = defineTool({
  name: 'full_analysis',
  description: [
    'One-shot market snapshot for a symbol. Runs the standard analysis stack',
    'in parallel and returns a structured digest: ticker, core indicators,',
    'multi-timeframe alignment, support / resistance, divergence scan, and',
    'optional perp funding, order-book imbalance, and macro regime.',
    '',
    'Reach for this when the user wants a trade read and the data needed is',
    'the default set. For a focused question (just price, just RSI, just a',
    'level), a single targeted tool is lighter.',
    '',
    'Interval guidance by horizon: scalp 15m, intraday 30m–1h, swing 4h–1d,',
    'position 1d. The multi-TF block is picked automatically based on the',
    'chosen interval so the higher timeframes frame the entry.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    symbol: z.string().describe('Binance spot pair, uppercase (e.g. BTCUSDT)'),
    interval: z.enum(INTERVALS).optional().describe('Default 1h'),
    includePerp: z.boolean().optional().describe('Fetch funding rate. Default true'),
    includeOrderBook: z.boolean().optional().describe('Fetch depth-50 order book. Default true'),
    includeMacro: z.boolean().optional().describe('Fetch Fear & Greed + dominance. Default true'),
  }),
  async execute(input, ctx) {
    const symbol = input.symbol.toUpperCase();
    const interval: Interval = input.interval ?? '1h';
    const mtfIntervals = MTF_BY_INTERVAL[interval];
    const wantPerp = input.includePerp ?? true;
    const wantBook = input.includeOrderBook ?? true;
    const wantMacro = input.includeMacro ?? true;

    const swallow = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

    const [ohlcvRes, ticker, mtf, funding, book, macro] = await Promise.all([
      getOhlcv.execute({ symbol, interval, limit: 200 }, ctx),
      swallow(getTicker24h.execute({ symbol }, ctx)),
      swallow(multiTimeframeAnalysis.execute({ symbol, intervals: [...mtfIntervals] }, ctx)),
      wantPerp ? swallow(getFundingRate.execute({ symbol }, ctx)) : Promise.resolve(null),
      wantBook ? swallow(getOrderBook.execute({ symbol, limit: 50 }, ctx)) : Promise.resolve(null),
      wantMacro ? swallow(getMarketContext.execute({}, ctx)) : Promise.resolve(null),
    ]);

    const candles = ohlcvRes.candles;
    const lastClose = candles[candles.length - 1]?.c ?? Number.NaN;

    const [indicators, sr, div] = await Promise.all([
      computeIndicators.execute(
        {
          candles,
          indicators: ['sma20', 'sma50', 'sma200', 'rsi14', 'macd', 'atr14', 'bb20', 'adx14'],
        },
        ctx,
      ),
      candles.length >= 20
        ? swallow(detectSupportResistance.execute({ candles }, ctx))
        : Promise.resolve(null),
      candles.length >= 60
        ? swallow(detectDivergence.execute({ candles, indicator: 'both' }, ctx))
        : Promise.resolve(null),
    ]);

    const ind = indicators.indicators as Record<string, unknown>;
    const sma20 = (ind.sma20 as number | null) ?? null;
    const sma50 = (ind.sma50 as number | null) ?? null;
    const sma200 = (ind.sma200 as number | null) ?? null;
    const rsi14 = (ind.rsi14 as number | null) ?? null;
    const macd = (ind.macd as { macd: number; signal: number; histogram: number } | null) ?? null;
    const atr14 = (ind.atr14 as number | null) ?? null;
    const bb20 =
      (ind.bb20 as {
        upper: number;
        mid: number;
        lower: number;
        percentB: number;
        bandwidth: number;
      } | null) ?? null;
    const adx14 = (ind.adx14 as { adx: number; plusDI: number; minusDI: number } | null) ?? null;

    return {
      symbol,
      interval,
      generatedAt: Date.now(),
      candleCount: candles.length,
      ticker: ticker
        ? {
            last: ticker.lastPrice,
            pct24h: ticker.priceChangePercent,
            high24h: ticker.high24h,
            low24h: ticker.low24h,
            quoteVolume: ticker.quoteVolume,
            trades: ticker.trades,
          }
        : null,
      price: {
        lastClose,
        atr14,
        atr14Pct: atr14 !== null && lastClose > 0 ? (atr14 / lastClose) * 100 : null,
      },
      trend: {
        sma20,
        sma50,
        sma200,
        stackBias: stackBias(lastClose, sma20, sma50, sma200),
      },
      momentum: {
        rsi14,
        macd,
        bb: bb20
          ? {
              upper: bb20.upper,
              mid: bb20.mid,
              lower: bb20.lower,
              percentB: bb20.percentB,
              bandwidth: bb20.bandwidth,
            }
          : null,
      },
      strength: adx14
        ? {
            adx: adx14.adx,
            plusDI: adx14.plusDI,
            minusDI: adx14.minusDI,
            verdict: adxVerdict(adx14.adx),
            direction: adx14.plusDI > adx14.minusDI ? 'bullish' : 'bearish',
          }
        : { verdict: 'unknown' as const },
      structure: sr
        ? {
            nearestSupport: sr.nearestSupport,
            nearestResistance: sr.nearestResistance,
            strongest: sr.strongest,
            levelCount: sr.levelCount,
          }
        : null,
      divergence: div ? { latest: div.latest, bullish: div.bullish, bearish: div.bearish } : null,
      multiTimeframe: mtf
        ? {
            intervals: mtf.intervals,
            alignment: mtf.alignment,
            rows: mtf.rows.map((r) => ({
              interval: r.interval,
              trend: r.trend,
              momentum: r.momentum,
              strength: r.strength,
              overall: r.overall,
            })),
          }
        : null,
      perp: funding
        ? {
            markPrice: funding.markPrice,
            lastFundingRate: funding.lastFundingRate,
            lastFundingRatePct: funding.lastFundingRatePct,
            nextFundingTime: funding.nextFundingTime,
          }
        : null,
      orderBook: book
        ? {
            bestBid: book.bestBid,
            bestAsk: book.bestAsk,
            mid: book.mid,
            spreadPct: book.spreadPct,
            imbalance: book.imbalance,
          }
        : null,
      macro: macro
        ? {
            fearGreed: macro.fearGreed,
            btcDominancePct: macro.btcDominancePct,
            ethDominancePct: macro.ethDominancePct,
            marketCapChange24hPct: macro.marketCapChange24hPct,
          }
        : null,
    };
  },
});
