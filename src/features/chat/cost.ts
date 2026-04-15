import type { Catalog, ModelRef } from '../models/catalog.js';
import type { TokenUsage } from '../tools/index.js';

export type CostBreakdown = {
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
};

export function computeCost(
  usage: TokenUsage,
  catalog: Catalog,
  ref: ModelRef,
): CostBreakdown | null {
  const cost = catalog[ref.providerId]?.models[ref.modelId]?.cost;
  if (!cost || (cost.input == null && cost.output == null)) return null;
  const inputUsd = ((cost.input ?? 0) * usage.inputTokens) / 1_000_000;
  const outputUsd = ((cost.output ?? 0) * usage.outputTokens) / 1_000_000;
  return { inputUsd, outputUsd, totalUsd: inputUsd + outputUsd };
}

export function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function formatUsd(amount: number): string {
  if (amount === 0) return '$0';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatUsageLine(usage: TokenUsage, cost: CostBreakdown | null): string {
  const tokens = `${formatTokens(usage.inputTokens)} in · ${formatTokens(usage.outputTokens)} out`;
  return cost ? `${tokens} · ${formatUsd(cost.totalUsd)}` : tokens;
}
