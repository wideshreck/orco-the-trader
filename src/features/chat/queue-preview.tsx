import { Box, Text } from 'ink';

// Small preview above the input box when messages are queued during a stream.
// Opens user's eyes to what will be sent next so a stuck/failed turn doesn't
// silently fire three more prompts.
export function QueuePreview(props: { queue: string[] }) {
  if (props.queue.length === 0) return null;
  const preview = props.queue.slice(0, 3);
  const overflow = props.queue.length - preview.length;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="yellow" bold>
        {props.queue.length} queued
      </Text>
      {preview.map((msg, i) => (
        <Text key={`${i}-${msg.slice(0, 20)}`} dimColor>
          {' '}
          {`${i + 1}. ${clip(msg, 72)}`}
        </Text>
      ))}
      {overflow > 0 && <Text dimColor> {`+${overflow} more`}</Text>}
    </Box>
  );
}

function clip(s: string, limit: number): string {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > limit ? `${oneLine.slice(0, limit - 1)}…` : oneLine;
}
