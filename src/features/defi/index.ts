import { register } from '../tools/registry.js';
import { getDefiTvl } from './tvl.js';

let bootstrapped = false;

export function bootstrapDefi(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  register(getDefiTvl);
}
