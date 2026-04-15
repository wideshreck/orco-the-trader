import { register } from '../tools/registry.js';
import { computeIndicators } from './tools/compute-indicators.js';
import { getFundingRate } from './tools/get-funding-rate.js';
import { getMarketContext } from './tools/get-market-context.js';
import { getOhlcv } from './tools/get-ohlcv.js';
import { getOrderBook } from './tools/get-order-book.js';
import { getLongShortRatio, getOpenInterest } from './tools/get-positioning.js';
import { getTicker24h } from './tools/get-ticker-24h.js';
import { listTopSymbols } from './tools/list-top-symbols.js';
import { multiTimeframeAnalysis } from './tools/multi-tf.js';
import { scanMarket } from './tools/scan-market.js';

let bootstrapped = false;

export function bootstrapTrading(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  register(getOhlcv);
  register(computeIndicators);
  register(getTicker24h);
  register(getOrderBook);
  register(getFundingRate);
  register(listTopSymbols);
  register(scanMarket);
  register(multiTimeframeAnalysis);
  register(getMarketContext);
  register(getOpenInterest);
  register(getLongShortRatio);
}

export type { Candle } from './tools/get-ohlcv.js';
export { adx, atr, bollinger, ema, macd, rsi, sma, stochastic, vwap } from './tools/indicators.js';
