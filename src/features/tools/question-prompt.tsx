import { Box, Text } from 'ink';
import { MultiLineInput } from '../../shared/ui/multi-line-input.js';
import type { QuestionRequest } from './index.js';

export function QuestionPrompt(props: {
  request: QuestionRequest;
  draft: string;
  onDraftChange: (v: string) => void;
  onSubmit: (answer: string) => void;
  isActive: boolean;
}) {
  const { request, draft, onDraftChange, onSubmit, isActive } = props;
  const hasChoices = request.choices && request.choices.length > 0;
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      paddingX={1}
      paddingY={1}
      marginY={1}
    >
      <Text color="magenta" bold>
        ? orco asks
      </Text>
      <Box marginTop={1}>
        <Text>{request.question}</Text>
      </Box>
      {hasChoices ? (
        <Box flexDirection="column" marginTop={1}>
          {request.choices?.map((choice, i) => (
            <Box key={choice}>
              <Text color="magenta" bold>
                [{i + 1}]
              </Text>
              <Text> {choice}</Text>
            </Box>
          ))}
          <Box marginTop={1}>
            <Text dimColor>press 1–{request.choices?.length} to pick · esc skip</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Box borderStyle="round" borderColor={draft.length > 0 ? 'magenta' : 'gray'} paddingX={1}>
            <Text color="magenta" bold>
              {'> '}
            </Text>
            <Box flexGrow={1} flexDirection="column">
              <MultiLineInput
                value={draft}
                onChange={onDraftChange}
                onSubmit={onSubmit}
                placeholder="type your answer · enter to submit · shift+enter or \\ for newline"
                isActive={isActive}
              />
            </Box>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>enter send · esc skip</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
