import { Box, Text } from 'ink';
import { useRef } from 'react';
import { Countdown } from '../../shared/ui/spinner.js';
import type { ApprovalRequest } from './index.js';
import { APPROVAL_TIMEOUT_MS } from './use-approval.js';

// Collapsed preview size. A typical 80-col terminal shows ~24 rows,
// we want to leave room for chat scrollback above — cap hard here.
const COLLAPSED_CHARS = 320;

export function ApprovalPrompt(props: { request: ApprovalRequest; expanded?: boolean }) {
  const { request, expanded = false } = props;
  const full = formatInput(request.input);
  const oversized = full.length > COLLAPSED_CHARS;
  const body = !oversized || expanded ? full : `${full.slice(0, COLLAPSED_CHARS)}…`;
  const deadlineRef = useRef<number>(Date.now() + APPROVAL_TIMEOUT_MS);
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      paddingY={1}
      marginY={1}
    >
      <Box>
        <Text color="yellow" bold>
          [!] approval required: {request.toolName}
        </Text>
        <Text dimColor>{'   auto-deny in '}</Text>
        <Countdown endMs={deadlineRef.current} warnAt={30} dangerAt={10} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{body}</Text>
      </Box>
      {oversized && (
        <Box>
          <Text dimColor>
            {expanded
              ? `  ↑ full input shown (${full.length} chars)`
              : `  … ${full.length - COLLAPSED_CHARS} more chars · press e to expand`}
          </Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text>
          <Text color="green">[a]</Text> allow once · <Text color="red">[d]</Text> deny ·{' '}
          <Text color="cyan">[A]</Text> always allow · <Text dimColor>[e]</Text> toggle detail ·{' '}
          <Text dimColor>[esc]</Text> deny
        </Text>
      </Box>
    </Box>
  );
}

function formatInput(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}
