import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { ApprovalRequest } from '../tools/index.js';
import { ApprovalPrompt } from './approval-prompt.js';
import { Banner } from './banner.js';
import type { SlashCommand } from './commands.js';
import { ToolCallView } from './tool-call-view.js';
import type { ChatRow } from './use-chat.js';

export type ChatFocus = 'input' | 'tools-bar' | 'tools-panel';

export type InfoPanel = { title: string; lines: string[] };

export function ChatView(props: {
  modelLabel: string;
  sessionLabel: string;
  messages: ChatRow[];
  streaming: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSubmit: (v: string) => void;
  focus: ChatFocus;
  exitWarning: boolean;
  suggestions: SlashCommand[];
  suggestionIdx: number;
  approval: ApprovalRequest | null;
  infoPanel: InfoPanel | null;
}) {
  const {
    modelLabel,
    sessionLabel,
    messages,
    streaming,
    input,
    focus,
    exitWarning,
    suggestions,
    suggestionIdx,
    approval,
    infoPanel,
  } = props;
  const showSuggestions = focus === 'input' && !streaming && !approval && suggestions.length > 0;
  const inputActive = focus === 'input' && !streaming && !approval;
  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Banner
          subtitle={
            <Box>
              <Text dimColor>The Trader v0.1 · </Text>
              <Text color="magenta">{modelLabel}</Text>
              <Text dimColor> · </Text>
              <Text color="cyan">{truncateLabel(sessionLabel)}</Text>
            </Box>
          }
        />
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {messages.length === 0 && (
          <Text dimColor>Type a message and press enter · /model select model · /clear reset</Text>
        )}
        {messages.map((msg, i) => {
          if (msg.kind === 'tool') return <ToolCallView key={msg.id} row={msg} />;
          const isLastAssistant =
            msg.kind === 'assistant' && i === messages.length - 1 && streaming;
          return (
            <Box key={msg.id} flexDirection="column" marginBottom={1}>
              <Text color={msg.kind === 'user' ? 'green' : 'magenta'} bold>
                {msg.kind === 'user' ? '› you' : '‹ orco'}
              </Text>
              {msg.kind === 'assistant' && msg.error ? (
                <Text color="red">{msg.content}</Text>
              ) : (
                <Text>{msg.content || (isLastAssistant ? '…' : '')}</Text>
              )}
            </Box>
          );
        })}
      </Box>

      <Box flexDirection="column">
        {approval && <ApprovalPrompt request={approval} />}
        {infoPanel && (
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="cyan"
            paddingX={1}
            paddingY={1}
            marginY={1}
          >
            <Text color="cyan" bold>
              {infoPanel.title}
            </Text>
            {infoPanel.lines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
            <Box marginTop={1}>
              <Text dimColor>press any key to dismiss</Text>
            </Box>
          </Box>
        )}
        {showSuggestions && (
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="cyan"
            paddingX={1}
            marginBottom={0}
          >
            {suggestions.map((cmd, i) => {
              const selected = i === suggestionIdx;
              return (
                <Box key={cmd.name}>
                  <Text
                    {...(selected ? { color: 'cyan' as const } : {})}
                    inverse={selected}
                    bold={selected}
                  >
                    {selected ? '▸ ' : '  '}
                    {cmd.name}
                  </Text>
                  <Text dimColor>
                    {'  '}
                    {cmd.description}
                  </Text>
                </Box>
              );
            })}
            <Box marginTop={1}>
              <Text dimColor>↑↓ navigate · tab complete · esc clear</Text>
            </Box>
          </Box>
        )}
        <Box
          borderStyle="round"
          borderColor={focus === 'input' && input.length > 0 ? 'cyan' : 'gray'}
          paddingX={1}
        >
          <Text color="cyan" bold>
            {'$ '}
          </Text>
          <Box flexGrow={1}>
            {inputActive ? (
              <TextInput
                value={input}
                onChange={props.onInputChange}
                onSubmit={props.onSubmit}
                placeholder="ask orco anything... (/model, /clear)"
                showCursor
              />
            ) : (
              <Text dimColor>
                {approval
                  ? 'awaiting approval...'
                  : streaming
                    ? 'orco is typing... (ctrl+c to cancel)'
                    : input || 'ask orco anything...'}
              </Text>
            )}
          </Box>
        </Box>

        <Box paddingX={2} justifyContent="space-between">
          <Box>
            {focus === 'tools-bar' ? (
              <Text color="cyan" inverse>
                {' tools '}
              </Text>
            ) : (
              <Text dimColor>tools</Text>
            )}
            <Text dimColor>
              {focus === 'input'
                ? '  (↓ to focus)'
                : focus === 'tools-bar'
                  ? '  (enter to open · esc to close)'
                  : ''}
            </Text>
          </Box>
          {exitWarning ? (
            <Text color="yellow">press ctrl+c again to exit</Text>
          ) : (
            <Text dimColor>/model · ctrl+c to exit</Text>
          )}
        </Box>

        {focus === 'tools-panel' && (
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="cyan"
            paddingX={1}
            paddingY={1}
            marginTop={1}
          >
            <Text color="cyan" bold>
              tools
            </Text>
            <Box marginTop={1}>
              <Text dimColor>no tools yet — coming soon...</Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>esc to close</Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function truncateLabel(s: string): string {
  if (s.length <= 30) return s;
  return `${s.slice(0, 29)}…`;
}
