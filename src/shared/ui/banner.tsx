import { Box, Text } from 'ink';
import type React from 'react';

export const BANNER_LINES = [
  ' ██████╗ ██████╗  ██████╗ ██████╗ ',
  '██╔═══██╗██╔══██╗██╔════╝██╔═══██╗',
  '██║   ██║██████╔╝██║     ██║   ██║',
  '██║   ██║██╔══██╗██║     ██║   ██║',
  '╚██████╔╝██║  ██║╚██████╗╚██████╔╝',
  ' ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ',
];

const CYAN = '\x1b[36;1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// Used by cli/main.tsx to print a one-time banner above Ink's render area so
// it lives in terminal scrollback (Ink never repaints it).
export function printBannerToStdout(): void {
  const out = process.stdout;
  out.write('\n');
  for (const line of BANNER_LINES) out.write(`  ${CYAN}${line}${RESET}\n`);
  out.write(`  ${DIM}orco the trader · v0.1${RESET}\n\n`);
}

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
      {BANNER_LINES.map((line) => (
        <Text key={line} color="cyan" bold>
          {line}
        </Text>
      ))}
      {props.subtitle ? <Box marginTop={1}>{props.subtitle}</Box> : null}
    </Box>
  );
}
