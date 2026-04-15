import { Box, Text } from 'ink';
import type { ToolRow } from './use-chat.js';

const PREVIEW_LIMIT = 200;

export function ToolCallView(props: { row: ToolRow }) {
  const { row } = props;
  const icon = iconFor(row.status);
  const color = colorFor(row.status);
  const inputPreview = preview(row.input);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={color} bold>
          {icon} {row.name}
        </Text>
        <Text dimColor>({inputPreview})</Text>
      </Box>
      {row.status === 'done' && row.output !== undefined && (
        <Box paddingLeft={2}>
          <Text dimColor>→ {preview(row.output)}</Text>
        </Box>
      )}
      {(row.status === 'error' || row.status === 'denied') && row.error && (
        <Box paddingLeft={2}>
          <Text color="red">→ {row.error}</Text>
        </Box>
      )}
      {row.status === 'awaiting-approval' && (
        <Box paddingLeft={2}>
          <Text color="yellow">awaiting approval</Text>
        </Box>
      )}
      {row.status === 'pending' && (
        <Box paddingLeft={2}>
          <Text dimColor>running...</Text>
        </Box>
      )}
    </Box>
  );
}

function iconFor(status: ToolRow['status']): string {
  switch (status) {
    case 'pending':
      return '…';
    case 'awaiting-approval':
      return '?';
    case 'done':
      return '✓';
    case 'error':
      return '✗';
    case 'denied':
      return '✗';
  }
}

function colorFor(status: ToolRow['status']): 'cyan' | 'green' | 'red' | 'yellow' {
  switch (status) {
    case 'pending':
      return 'cyan';
    case 'awaiting-approval':
      return 'yellow';
    case 'done':
      return 'green';
    case 'error':
    case 'denied':
      return 'red';
  }
}

function preview(value: unknown): string {
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    if (!s) return '';
    if (s.length <= PREVIEW_LIMIT) return s;
    return `${s.slice(0, PREVIEW_LIMIT)}... (${s.length - PREVIEW_LIMIT} more)`;
  } catch {
    return String(value);
  }
}
