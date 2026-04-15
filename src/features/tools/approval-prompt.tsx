import { Box, Text } from 'ink';
import type { ApprovalRequest } from './index.js';

export function ApprovalPrompt(props: { request: ApprovalRequest }) {
  const { request } = props;
  const inputJson = formatInput(request.input);
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      paddingY={1}
      marginY={1}
    >
      <Text color="yellow" bold>
        ⚠ approval required: {request.toolName}
      </Text>
      <Box marginTop={1}>
        <Text dimColor>{inputJson}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          <Text color="green">[a]</Text> allow once · <Text color="red">[d]</Text> deny ·{' '}
          <Text color="cyan">[A]</Text> always allow
        </Text>
      </Box>
    </Box>
  );
}

function formatInput(input: unknown): string {
  try {
    const s = JSON.stringify(input, null, 2);
    if (s.length <= 400) return s;
    return `${s.slice(0, 400)}... (${s.length - 400} more chars)`;
  } catch {
    return String(input);
  }
}
