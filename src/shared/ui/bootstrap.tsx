import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import type { McpSnapshot } from '../../app/use-bootstrap.js';
import { Banner } from './banner.js';
import { Spinner } from './spinner.js';

export function Bootstrap(props: { status: string; error?: string | null; mcp?: McpSnapshot }) {
  return (
    <Box flexDirection="column" padding={1}>
      <Banner subtitle={<Text dimColor>The Trader v0.1</Text>} />
      <Box marginTop={1}>
        {props.error ? (
          <Text color="red">✗ {props.error}</Text>
        ) : (
          <>
            <Spinner />
            <Text color="cyan"> {props.status}</Text>
            <ElapsedHint />
          </>
        )}
      </Box>
      {props.mcp && props.mcp.ready + props.mcp.connecting + props.mcp.failed > 0 && (
        <Box marginTop={1}>
          <Text dimColor>MCP: </Text>
          {props.mcp.ready > 0 && <Text color="green">{props.mcp.ready} ready</Text>}
          {props.mcp.ready > 0 && props.mcp.connecting > 0 && <Text dimColor> · </Text>}
          {props.mcp.connecting > 0 && (
            <Text color="yellow">{props.mcp.connecting} connecting</Text>
          )}
          {props.mcp.failed > 0 && (
            <>
              <Text dimColor> · </Text>
              <Text color="red">{props.mcp.failed} failed</Text>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

// Inline hint that blooms after the user has been staring at the spinner
// long enough to wonder. Three stages: quiet → "still trying…" → "network?".
function ElapsedHint() {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - start), 500);
    return () => clearInterval(id);
  }, []);
  if (elapsedMs < 3000) return null;
  if (elapsedMs < 8000) return <Text dimColor>{'  (still trying…)'}</Text>;
  return <Text color="yellow">{'  (network issue? check connection)'}</Text>;
}
