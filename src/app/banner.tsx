import { Box, Text } from 'ink';
import type React from 'react';

const LINES = [
  ' ██████╗ ██████╗  ██████╗ ██████╗ ',
  '██╔═══██╗██╔══██╗██╔════╝██╔═══██╗',
  '██║   ██║██████╔╝██║     ██║   ██║',
  '██║   ██║██╔══██╗██║     ██║   ██║',
  '╚██████╔╝██║  ██║╚██████╗╚██████╔╝',
  ' ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ',
];

export function Banner(props: { subtitle?: React.ReactNode }) {
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      {LINES.map((line) => (
        <Text key={line} color="cyan" bold>
          {line}
        </Text>
      ))}
      {props.subtitle ? <Box marginTop={1}>{props.subtitle}</Box> : null}
    </Box>
  );
}
