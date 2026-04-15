import { register } from '../tools/registry.js';
import { computeIndicators } from './tools/compute-indicators.js';
import { getFundingRate } from './tools/get-funding-rate.js';
import { getOhlcv } from './tools/get-ohlcv.js';
import { getOrderBook } from './tools/get-order-book.js';
import { getTicker24h } from './tools/get-ticker-24h.js';

let bootstrapped = false;

export function bootstrapTrading(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  register(getOhlcv);
  register(computeIndicators);
  register(getTicker24h);
  register(getOrderBook);
  register(getFundingRate);
}

export type { Candle } from './tools/get-ohlcv.js';
export { adx, atr, bollinger, ema, macd, rsi, sma, stochastic, vwap } from './tools/indicators.js';
