import { Box, Text } from 'ink';
import { useColumns } from '../../shared/ui/use-columns.js';
import type { TokenUsage } from '../tools/index.js';
import { ContextBar } from './context-bar.js';
import { type CostBreakdown, formatTokens, formatUsd } from './cost.js';

export type StatusBarProps = {
  modelLabel: string;
  sessionLabel: string;
  totalTokens: TokenUsage;
  totalCost: CostBreakdown | null;
  lastInputTokens: number;
  contextLimit: number | null;
  compactionActive: boolean;
  queueCount: number;
  focus: 'input' | 'tools-bar' | 'tools-panel';
  exitWarning: boolean;
};

// Two-line responsive footer. Top line: context bar + token/cost totals.
// Bottom line: model · session · queue/focus hints · exit state. Items drop
// out progressively as columns shrink; the exit state always stays visible.
export function StatusBar(props: StatusBarProps) {
  const cols = useColumns();
  const wide = cols >= 100;
  const mid = cols >= 70;

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        {props.contextLimit && props.contextLimit > 0 ? (
          <ContextBar
            used={props.lastInputTokens}
            limit={props.contextLimit}
            compact={!mid}
            compacted={props.compactionActive}
          />
        ) : props.compactionActive ? (
          <Text color="blue">compacted</Text>
        ) : null}
        {mid && props.totalTokens.inputTokens + props.totalTokens.outputTokens > 0 && (
          <>
            {/* Σ prefix marks this as the session-wide total, so users don't
                confuse it with the per-turn "in · out · cost" line rendered
                under each assistant message. */}
            <Text dimColor>
              {'  · Σ '}
              {formatTokens(props.totalTokens.inputTokens)} in ·{' '}
              {formatTokens(props.totalTokens.outputTokens)} out
            </Text>
            {props.totalCost && (
              <Text dimColor>
                {' · '}
                {formatUsd(props.totalCost.totalUsd)}
              </Text>
            )}
          </>
        )}
      </Box>
      <Box paddingX={1} justifyContent="space-between">
        <Box>
          <Text dimColor>{props.modelLabel}</Text>
          {/* Down-triangle hints the label is changeable via /model — same
              convention dropdowns use. Keeps the footer compact. */}
          <Text dimColor>▾</Text>
          {mid && (
            <>
              <Text dimColor> · </Text>
              <Text dimColor>{truncate(props.sessionLabel, 28)}</Text>
            </>
          )}
          {props.queueCount > 0 && (
            <Text color="yellow">
              {' · '}
              {props.queueCount} queued
            </Text>
          )}
          {wide && props.focus === 'tools-bar' && (
            <Text dimColor>{'  '}(↓ tools-bar · enter open · esc back)</Text>
          )}
        </Box>
        {props.exitWarning ? (
          <Text color="yellow">press ctrl+c again to exit</Text>
        ) : (
          wide && <Text dimColor>ctrl+c to exit</Text>
        )}
      </Box>
    </Box>
  );
}

function truncate(s: string, limit: number): string {
  if (s.length <= limit) return s;
  return `${s.slice(0, limit - 1)}…`;
}
