import { Box, Text } from 'ink';
import { Banner } from './banner.js';

export function Bootstrap(props: { status: string; error?: string | null }) {
  return (
    <Box flexDirection="column" padding={1}>
      <Banner subtitle={<Text dimColor>The Trader v0.1</Text>} />
      <Box marginTop={1}>
        {props.error ? (
          <Text color="red">✗ {props.error}</Text>
        ) : (
          <Text color="cyan">⏳ {props.status}</Text>
        )}
      </Box>
    </Box>
  );
}
