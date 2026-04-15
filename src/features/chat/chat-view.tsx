import { Box, Static, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { SlashCommand } from '../../commands/index.js';
import { renderMarkdown } from '../../shared/ui/markdown.js';
import { ApprovalPrompt } from '../tools/approval-prompt.js';
import type { ApprovalRequest } from '../tools/index.js';
import { ToolCallView } from './tool-call-view.js';
import type { ChatRow } from './use-chat.js';

export type ChatFocus = 'input' | 'tools-bar' | 'tools-panel';

export type InfoPanel = { title: string; lines: string[] };

export function ChatView(props: {
  modelLabel: string;
  sessionLabel: string;
  scrollback: ChatRow[];
  live: ChatRow[];
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
    scrollback,
    live,
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
    <>
      {/* Static prints each row exactly once and commits it to terminal scrollback.
          Past turns scroll up out of the dynamic area so native terminal scroll works. */}
      <Static items={scrollback}>{(row) => <ChatRowView key={row.id} row={row} />}</Static>

      <Box flexDirection="column" paddingX={1}>
        <Box flexDirection="column" marginBottom={live.length > 0 ? 1 : 0}>
          {live.length === 0 && scrollback.length === 0 && (
            <Text dimColor>type a message and press enter · /help for commands</Text>
          )}
          {live.map((msg, i) => {
            const isLastAssistant = msg.kind === 'assistant' && i === live.length - 1 && streaming;
            return <ChatRowView key={msg.id} row={msg} placeholder={isLastAssistant ? '…' : ''} />;
          })}
        </Box>

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
              <Text dimColor>press esc · enter · space to dismiss</Text>
            </Box>
          </Box>
        )}
        {showSuggestions && (
          <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
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
              <Text dimColor>↑↓ navigate · tab complete · esc dismiss</Text>
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
                placeholder="ask orco anything... (/help)"
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

        <Box paddingX={1} justifyContent="space-between">
          <Box>
            <Text dimColor>{modelLabel}</Text>
            <Text dimColor> · </Text>
            <Text dimColor>{truncateLabel(sessionLabel)}</Text>
            {focus === 'tools-bar' && (
              <Text dimColor>{'  '}(↓ tools-bar focused · enter open · esc back)</Text>
            )}
          </Box>
          {exitWarning ? (
            <Text color="yellow">press ctrl+c again to exit</Text>
          ) : (
            <Text dimColor>ctrl+c to exit</Text>
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
    </>
  );
}

function ChatRowView(props: { row: ChatRow; placeholder?: string }) {
  const { row, placeholder = '' } = props;
  if (row.kind === 'tool') return <ToolCallView row={row} />;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={row.kind === 'user' ? 'green' : 'magenta'} bold>
        {row.kind === 'user' ? '› you' : '‹ orco'}
      </Text>
      {row.kind === 'assistant' && row.error ? (
        <Text color="red">{row.content}</Text>
      ) : row.kind === 'assistant' ? (
        <Text>{row.content ? renderMarkdown(row.content) : placeholder}</Text>
      ) : (
        <Text>{row.content}</Text>
      )}
    </Box>
  );
}

function truncateLabel(s: string): string {
  if (s.length <= 30) return s;
  return `${s.slice(0, 29)}…`;
}
