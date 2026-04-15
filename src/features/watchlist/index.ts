import { register } from '../tools/registry.js';
import { watchlistTool } from './tool.js';

let bootstrapped = false;

export function bootstrapWatchlist(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  register(watchlistTool);
}

export { loadWatchlist } from './storage.js';
