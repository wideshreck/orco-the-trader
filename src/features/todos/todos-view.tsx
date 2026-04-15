import { Box, Text } from 'ink';
import type { Todo } from './types.js';

function icon(status: Todo['status']): string {
  switch (status) {
    case 'completed':
      return '✓';
    case 'in_progress':
      return '●';
    case 'pending':
      return '○';
  }
}

function color(status: Todo['status']): 'green' | 'cyan' | 'gray' {
  switch (status) {
    case 'completed':
      return 'green';
    case 'in_progress':
      return 'cyan';
    case 'pending':
      return 'gray';
  }
}

export function TodosView(props: { todos: Todo[] }) {
  const { todos } = props;
  if (todos.length === 0) return null;
  const done = todos.filter((t) => t.status === 'completed').length;
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={1}
      marginY={1}
    >
      <Box justifyContent="space-between">
        <Text color="cyan" bold>
          todos
        </Text>
        <Text dimColor>
          {done}/{todos.length} done
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {todos.map((t) => {
          const label = t.status === 'in_progress' && t.activeForm ? t.activeForm : t.content;
          return (
            <Box key={`${t.status}-${t.content}`}>
              <Text color={color(t.status)} bold={t.status === 'in_progress'}>
                {icon(t.status)}{' '}
              </Text>
              <Text
                {...(t.status === 'completed' ? { dimColor: true, strikethrough: true } : {})}
                {...(t.status === 'in_progress' ? { bold: true } : {})}
              >
                {label}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
