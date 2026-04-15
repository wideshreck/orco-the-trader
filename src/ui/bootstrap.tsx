import React from 'react';
import { Box, Text } from 'ink';

export function Bootstrap(props: { status: string; error?: string | null }) {
  return (
    <Box flexDirection="column" padding={1}>
      <Box
        flexDirection="column"
        alignItems="center"
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
      >
        <Text color="cyan" bold>{'     ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗'}</Text>
        <Text color="cyan" bold>{'     ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝'}</Text>
        <Text color="cyan" bold>{'     ██║███████║██████╔╝██║   ██║██║███████╗'}</Text>
        <Text color="cyan" bold>{'██   ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║'}</Text>
        <Text color="cyan" bold>{'╚█████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║███████║'}</Text>
        <Text color="cyan" bold>{' ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝'}</Text>
        <Box marginTop={1}>
          <Text dimColor>The Trader v0.1</Text>
        </Box>
      </Box>
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
