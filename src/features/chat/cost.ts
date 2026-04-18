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

// Aggregate session-wide cost. Returns null when either no usage has been
// recorded or the model has no price metadata, so callers can decide whether
// to show a running total at all.
export function totalSessionCost(
  rows: { kind: string; usage?: TokenUsage }[],
  catalog: Catalog,
  ref: ModelRef,
): CostBreakdown | null {
  let input = 0;
  let output = 0;
  let total = 0;
  for (const row of rows) {
    if (row.kind !== 'assistant' || !row.usage) continue;
    const c = computeCost(row.usage, catalog, ref);
    if (!c) continue;
    input += c.inputUsd;
    output += c.outputUsd;
    total += c.totalUsd;
  }
  return total > 0 ? { inputUsd: input, outputUsd: output, totalUsd: total } : null;
}
