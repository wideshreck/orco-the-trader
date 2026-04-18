import { Box, Text } from 'ink';
import { useRef } from 'react';
import { renderMarkdown } from '../../shared/ui/markdown.js';
import { Elapsed, Spinner } from '../../shared/ui/spinner.js';
import { stripAnsi } from '../../shared/ui/strip-ansi.js';
import type { TokenUsage } from '../tools/index.js';
import { ToolCallView } from './tool-call-view.js';
import type { ChatRow } from './types.js';

export function ChatRowView(props: {
  row: ChatRow;
  thinking?: boolean;
  formatUsage: (usage: TokenUsage) => string;
}) {
  const { row, thinking = false, formatUsage } = props;
  if (row.kind === 'tool') return <ToolCallView row={row} />;
  const isUser = row.kind === 'user';
  const badgeColor = isUser ? 'green' : 'magenta';
  const badgeLabel = isUser ? ' you ' : ' orco ';
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text color={badgeColor} inverse bold>
          {badgeLabel}
        </Text>
      </Box>
      {row.kind === 'assistant' && row.error ? (
        <Text color="red">{stripAnsi(row.content)}</Text>
      ) : row.kind === 'assistant' ? (
        row.content ? (
          <Text>{renderMarkdown(row.content)}</Text>
        ) : thinking ? (
          <ThinkingIndicator />
        ) : null
      ) : (
        <Text>{row.content}</Text>
      )}
      {row.kind === 'assistant' && row.usage && (
        <Box marginTop={1}>
          <Text dimColor>{formatUsage(row.usage)}</Text>
        </Box>
      )}
    </Box>
  );
}

function ThinkingIndicator() {
  const startRef = useRef<number>(Date.now());
  return (
    <Box>
      <Spinner color="magenta" />
      <Text dimColor> thinking · </Text>
      <Elapsed startMs={startRef.current} />
    </Box>
  );
}

export function sumTokens(rows: ChatRow[]): TokenUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const r of rows) {
    if (r.kind === 'assistant' && r.usage) {
      inputTokens += r.usage.inputTokens;
      outputTokens += r.usage.outputTokens;
    }
  }
  return { inputTokens, outputTokens };
}

export function lastTurnInput(rows: ChatRow[]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r && r.kind === 'assistant' && r.usage) return r.usage.inputTokens;
  }
  return 0;
}
