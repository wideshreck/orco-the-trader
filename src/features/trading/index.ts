import { register } from '../tools/registry.js';
import { computeIndicators } from './tools/compute-indicators.js';
import { correlateAssets } from './tools/correlate-assets.js';
import { detectDivergence } from './tools/detect-divergence.js';
import { detectSupportResistance } from './tools/detect-sr.js';
import { fullAnalysis } from './tools/full-analysis.js';
import { getFundingRate } from './tools/get-funding-rate.js';
import { getMarketContext } from './tools/get-market-context.js';
import { getOhlcv } from './tools/get-ohlcv.js';
import { getOrderBook } from './tools/get-order-book.js';
import { getLongShortRatio, getOpenInterest } from './tools/get-positioning.js';
import { getTicker24h } from './tools/get-ticker-24h.js';
import { listTopSymbols } from './tools/list-top-symbols.js';
import { multiTimeframeAnalysis } from './tools/multi-tf.js';
import { positionSize } from './tools/position-size.js';
import { scanMarket } from './tools/scan-market.js';
import { seasonality } from './tools/seasonality.js';
import { validateTradePlan } from './tools/validate-trade-plan.js';

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
  register(detectSupportResistance);
  register(positionSize);
  register(detectDivergence);
  register(fullAnalysis);
  register(validateTradePlan);
  register(correlateAssets);
  register(seasonality);
}

export type { Candle } from './tools/get-ohlcv.js';
export { adx, atr, bollinger, ema, macd, rsi, sma, stochastic, vwap } from './tools/indicators.js';
