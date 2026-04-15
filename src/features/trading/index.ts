import { register } from '../tools/registry.js';
import { computeIndicators } from './tools/compute-indicators.js';
import { getOhlcv } from './tools/get-ohlcv.js';

let bootstrapped = false;

export function bootstrapTrading(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  register(getOhlcv);
  register(computeIndicators);
}

export type { Candle } from './tools/get-ohlcv.js';
export { atr, ema, macd, rsi, sma } from './tools/indicators.js';
