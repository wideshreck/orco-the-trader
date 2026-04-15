import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import { setAuth } from '../auth.js';
import type { CatalogProvider } from '../catalog.js';

export function AuthPrompt(props: {
  provider: CatalogProvider;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  useInput((_, k) => {
    if (k.escape) props.onCancel();
  });

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('cannot be empty');
      return;
    }
    setAuth(props.provider.id, { type: 'api', key: trimmed });
    props.onDone();
  };

  const masked = '•'.repeat(Math.min(key.length, 40));

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} paddingY={1}>
      <Text color="yellow" bold>
        {props.provider.name} requires an API key
      </Text>
      <Box marginTop={1}>
        <Text dimColor>Env: </Text>
        <Text>{props.provider.env.join(', ') || '(none)'}</Text>
      </Box>
      {props.provider.doc && (
        <Box>
          <Text dimColor>Docs: </Text>
          <Text>{props.provider.doc}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="cyan">key: </Text>
        <Box flexGrow={1}>
          <TextInput value={key} onChange={setKey} onSubmit={submit} mask="•" />
        </Box>
        <Text dimColor> ({masked.length})</Text>
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>enter saves · esc cancels · stored at ~/.config/orco/auth.json (0600)</Text>
      </Box>
    </Box>
  );
}
