import type { Strategy } from '../types.js';
import { bollingerMeanReversion } from './bollinger-mr.js';
import { donchianBreakout } from './donchian.js';
import { maCrossover } from './ma-crossover.js';
import { rsiReversal } from './rsi-reversal.js';

export const PRESETS: readonly Strategy[] = [
  rsiReversal,
  maCrossover,
  bollingerMeanReversion,
  donchianBreakout,
] as const;

export function findPreset(name: string): Strategy | undefined {
  return PRESETS.find((s) => s.name === name);
}

export type PresetName = (typeof PRESETS)[number]['name'];
