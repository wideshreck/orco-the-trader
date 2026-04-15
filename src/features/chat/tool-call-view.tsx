import { Box, Text } from 'ink';
import type { ToolRow } from './use-chat.js';

const INPUT_PREVIEW = 70;
const OUTPUT_PREVIEW = 140;

export function ToolCallView(props: { row: ToolRow }) {
  const { row } = props;
  const icon = iconFor(row.status);
  const color = colorFor(row.status);
  const inputPreview = preview(row.input, INPUT_PREVIEW);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={color} bold>
          {icon} {row.name}
        </Text>
        {inputPreview && <Text dimColor> {inputPreview}</Text>}
      </Box>
      {row.status === 'done' && row.output !== undefined && (
        <Box paddingLeft={2}>
          <Text dimColor>→ {preview(row.output, OUTPUT_PREVIEW)}</Text>
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

/** Single-line preview of a JSON-ish value. Collapses whitespace and shows
 * just the first/last few chars of any long array so the row always fits one
 * visual line regardless of terminal width. */
function preview(value: unknown, limit: number): string {
  if (value === null || value === undefined) return '';
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value, null, 0);
    if (!s) return '';
    const oneLine = s.replace(/\s+/g, ' ');
    if (oneLine.length <= limit) return oneLine;
    return `${oneLine.slice(0, limit)}… +${oneLine.length - limit}`;
  } catch {
    return String(value);
  }
}
