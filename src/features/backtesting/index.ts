import { register } from '../tools/registry.js';
import { sweepBacktest } from './sweep-tool.js';
import { backtest } from './tool.js';

let bootstrapped = false;

export function bootstrapBacktesting(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  register(backtest);
  register(sweepBacktest);
}

export { runBacktest } from './engine.js';
export { PRESETS } from './presets/index.js';
export type { BacktestResult, Metrics, Trade } from './types.js';
