import { Box, Text } from 'ink';
import type { ToolRow } from './use-chat.js';

export function ToolCallView(props: { row: ToolRow }) {
  const { row } = props;
  const icon = iconFor(row.status);
  const color = colorFor(row.status);
  const inputSummary = summarizeInput(row.input);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={color} bold>
          {icon} {row.name}
        </Text>
        {inputSummary && (
          <Text dimColor>
            {'  '}
            {inputSummary}
          </Text>
        )}
      </Box>
      {row.status === 'done' && row.output !== undefined && (
        <Box paddingLeft={2}>
          <Text dimColor>→ {summarizeOutput(row.output)}</Text>
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

const MAX_INPUT = 80;
const MAX_OUTPUT = 80;

/** One-line human summary of tool input. Renders small objects as
 * `key=value · key=value`; falls back to truncated JSON for exotic shapes. */
function summarizeInput(input: unknown): string {
  if (input === null || input === undefined) return '';
  if (typeof input !== 'object' || Array.isArray(input)) {
    return clip(stringify(input), MAX_INPUT);
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return '';
  const parts = entries.slice(0, 4).map(([k, v]) => `${k}=${scalar(v)}`);
  const tail = entries.length > 4 ? ` · +${entries.length - 4} more` : '';
  return clip(parts.join(' · ') + tail, MAX_INPUT);
}

/** One-line summary of tool output. Prefers array counts, falls back to a
 * short key=value preview. Never dumps raw JSON. */
function summarizeOutput(output: unknown): string {
  if (output === null || output === undefined) return 'ok';
  if (Array.isArray(output)) return `${output.length} items`;
  if (typeof output !== 'object') return clip(stringify(output), MAX_OUTPUT);
  const obj = output as Record<string, unknown>;
  // If there's a `count` or array field, lead with that — most informative.
  if (typeof obj.count === 'number') {
    const extra = summarizeSiblings(obj, ['count']);
    return extra ? `${obj.count} · ${extra}` : `${obj.count}`;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      const extra = summarizeSiblings(obj, [k]);
      return extra ? `${v.length} ${k} · ${extra}` : `${v.length} ${k}`;
    }
  }
  // No obvious aggregate — summarize top fields.
  const entries = Object.entries(obj).slice(0, 3);
  const parts = entries.map(([k, v]) => `${k}=${scalar(v)}`);
  return clip(parts.join(' · '), MAX_OUTPUT);
}

function summarizeSiblings(obj: Record<string, unknown>, skip: string[]): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (skip.includes(k)) continue;
    if (Array.isArray(v) || (v !== null && typeof v === 'object')) continue;
    out.push(`${k}=${scalar(v)}`);
    if (out.length >= 2) break;
  }
  return out.join(' · ');
}

function scalar(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v.length > 24 ? `${v.slice(0, 24)}…` : v;
  if (typeof v === 'number') {
    // Keep reasonable precision for price-like numbers.
    if (Number.isInteger(v)) return String(v);
    if (Math.abs(v) > 1000) return v.toFixed(2);
    if (Math.abs(v) > 1) return v.toFixed(4);
    return v.toPrecision(4);
  }
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === 'object') return '{…}';
  return String(v);
}

function stringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function clip(s: string, limit: number): string {
  const oneLine = s.replace(/\s+/g, ' ');
  return oneLine.length > limit ? `${oneLine.slice(0, limit)}…` : oneLine;
}
