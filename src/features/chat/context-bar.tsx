import { Box, Text } from 'ink';
import { formatTokens } from './cost.js';

const BAR_LENGTH = 10;

// Always-visible context-window usage bar. 10-cell unicode block gradient
// transitions green → yellow → red around 75% / 90%. Collapses to a minimal
// "N% full" when the terminal is narrow.
export function ContextBar(props: {
  used: number;
  limit: number;
  compact?: boolean;
  compacted?: boolean;
}) {
  const { used, limit, compact = false, compacted = false } = props;
  if (!limit || limit <= 0) return null;
  const ratio = Math.max(0, Math.min(1, used / limit));
  const pct = Math.round(ratio * 100);
  const color: 'green' | 'yellow' | 'red' = ratio < 0.6 ? 'green' : ratio < 0.85 ? 'yellow' : 'red';

  if (compact) {
    return (
      <Box>
        <Text color={color}>{pct}% ctx</Text>
        {compacted && <Text color="blue"> · compacted</Text>}
      </Box>
    );
  }

  const filled = Math.min(BAR_LENGTH, Math.ceil(ratio * BAR_LENGTH));
  const empty = BAR_LENGTH - filled;
  return (
    <Box>
      <Text dimColor>[</Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(empty)}</Text>
      <Text dimColor>] </Text>
      <Text color={color}>{pct}%</Text>
      <Text dimColor>
        {' '}
        {formatTokens(used)}/{formatTokens(limit)}
      </Text>
      {compacted && <Text color="blue"> · compacted</Text>}
    </Box>
  );
}
