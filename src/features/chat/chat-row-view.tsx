import { Box, Text } from 'ink';
import { useEffect, useRef, useState } from 'react';
import { renderMarkdown } from '../../shared/ui/markdown.js';
import { Spinner } from '../../shared/ui/spinner.js';
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
          // Streaming assistant row: `thinking` is true while content is being
          // appended token-by-token. Skip the full markdown parse on every
          // delta — it's O(content²) over the stream and the heaviest thing
          // in the hot path. Plain stripAnsi'd text renders instantly; the
          // row re-renders with full markdown once it moves to scrollback.
          thinking ? (
            <Text>{stripAnsi(row.content)}</Text>
          ) : (
            <Text>{renderMarkdown(row.content)}</Text>
          )
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

// Thinking indicator with progressive hints: the model sitting on a big
// synthesis step (20+ tool outputs, multi-TF analysis) can genuinely need
// 60–120s of silent reasoning. A plain "thinking · 90s" spinner makes the
// user wonder if the stream died. Bloom into increasingly informative
// messaging so the wait feels observed, not broken.
function ThinkingIndicator() {
  const startRef = useRef<number>(Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startRef.current) / 1000));
  const label = formatSeconds(seconds);
  // Colors follow the same traffic-light shape as other ORCO countdowns.
  if (seconds < 20) {
    return (
      <Box>
        <Spinner color="magenta" />
        <Text dimColor>{` thinking · ${label}`}</Text>
      </Box>
    );
  }
  if (seconds < 60) {
    return (
      <Box>
        <Spinner color="magenta" />
        <Text dimColor>{` processing results · `}</Text>
        <Text color="yellow">{label}</Text>
      </Box>
    );
  }
  if (seconds < 120) {
    return (
      <Box>
        <Spinner color="magenta" />
        <Text dimColor>{` still synthesising · `}</Text>
        <Text color="yellow">{label}</Text>
        <Text dimColor> (large context — hang tight)</Text>
      </Box>
    );
  }
  return (
    <Box>
      <Spinner color="magenta" />
      <Text dimColor>{` still no output · `}</Text>
      <Text color="red">{label}</Text>
      <Text dimColor> (ctrl+c to cancel; lighter model or narrower prompt helps)</Text>
    </Box>
  );
}

function formatSeconds(total: number): string {
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
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
