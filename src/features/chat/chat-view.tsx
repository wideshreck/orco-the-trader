import { Box, Static, Text } from 'ink';
import type { SlashCommand } from '../../commands/index.js';
import { renderMarkdown } from '../../shared/ui/markdown.js';
import { MultiLineInput } from '../../shared/ui/multi-line-input.js';
import { type Todo, TodosView } from '../todos/index.js';
import { ApprovalPrompt } from '../tools/approval-prompt.js';
import type { ApprovalRequest, QuestionRequest, TokenUsage } from '../tools/index.js';
import { QuestionPrompt } from '../tools/question-prompt.js';
import { formatTokens } from './cost.js';
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
  formatUsage: (usage: TokenUsage) => string;
  contextLimit: number | null;
  compactionActive: boolean;
  queue: string[];
  question: QuestionRequest | null;
  questionDraft: string;
  onQuestionDraftChange: (v: string) => void;
  onQuestionSubmit: (answer: string) => void;
  todos: Todo[];
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
  const { queue, question, questionDraft, onQuestionDraftChange, onQuestionSubmit, todos } = props;
  const showSuggestions = focus === 'input' && !streaming && !approval && suggestions.length > 0;
  // Input stays typeable while streaming / awaiting approval: submissions
  // are queued by the parent and drained when the slot clears. Disabled while
  // the agent is asking a question so keystrokes go to the question prompt.
  const inputActive = focus === 'input' && !approval && !question;
  const questionInputActive = question !== null && !question.choices;
  // Hide pre-tool assistant rows (no text content, just triggered a tool call).
  // They would render as "‹ orco" headers with only a usage footer — noisy.
  const visibleScrollback = scrollback.filter(
    (r) => !(r.kind === 'assistant' && !r.content && !r.error),
  );
  const totalTokens = sumTokens([...scrollback, ...live]);
  const lastInputTokens = lastTurnInput([...scrollback, ...live]);
  const { contextLimit, compactionActive } = props;
  const ratio =
    contextLimit && contextLimit > 0 && lastInputTokens > 0 ? lastInputTokens / contextLimit : 0;
  const contextColor: 'green' | 'yellow' | 'red' =
    ratio < 0.5 ? 'green' : ratio < 0.8 ? 'yellow' : 'red';
  const contextWarn = ratio >= 0.75;

  return (
    <>
      {/* Static prints each row exactly once and commits it to terminal scrollback.
          Past turns scroll up out of the dynamic area so native terminal scroll works. */}
      <Static items={visibleScrollback}>
        {(row) => <ChatRowView key={row.id} row={row} formatUsage={props.formatUsage} />}
      </Static>

      <Box flexDirection="column" paddingX={1}>
        <Box flexDirection="column" marginBottom={live.length > 0 ? 1 : 0}>
          {live.length === 0 && scrollback.length === 0 && (
            <Text dimColor>type a message and press enter · /help for commands</Text>
          )}
          {live.map((msg, i) => {
            const isLastAssistant = msg.kind === 'assistant' && i === live.length - 1 && streaming;
            // Same filter as scrollback: drop empty non-active assistant rows.
            if (msg.kind === 'assistant' && !msg.content && !msg.error && !isLastAssistant) {
              return null;
            }
            return (
              <ChatRowView
                key={msg.id}
                row={msg}
                placeholder={isLastAssistant ? '…' : ''}
                formatUsage={props.formatUsage}
              />
            );
          })}
        </Box>

        <TodosView todos={todos} />
        {approval && <ApprovalPrompt request={approval} />}
        {question && (
          <QuestionPrompt
            request={question}
            draft={questionDraft}
            onDraftChange={onQuestionDraftChange}
            onSubmit={onQuestionSubmit}
            isActive={questionInputActive}
          />
        )}
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
          <Box flexGrow={1} flexDirection="column">
            {inputActive ? (
              <MultiLineInput
                value={input}
                onChange={props.onInputChange}
                onSubmit={props.onSubmit}
                placeholder={
                  streaming
                    ? 'orco is typing — your next message will queue...'
                    : 'ask orco anything... (/help · shift+enter or \\ for newline)'
                }
                isActive={inputActive}
              />
            ) : (
              <Text dimColor>
                {approval ? 'awaiting approval...' : input || 'ask orco anything...'}
              </Text>
            )}
          </Box>
        </Box>

        {contextWarn && (
          <Box>
            <Text color="yellow">
              ⚠ context {Math.round(ratio * 100)}% full — /compact to summarize older messages
            </Text>
          </Box>
        )}
        <Box paddingX={1} justifyContent="space-between">
          <Box>
            <Text dimColor>{modelLabel}</Text>
            <Text dimColor> · </Text>
            <Text dimColor>{truncateLabel(sessionLabel)}</Text>
            {totalTokens.inputTokens + totalTokens.outputTokens > 0 && (
              <Text dimColor>
                {' · '}
                {formatTokens(totalTokens.inputTokens)}/{formatTokens(totalTokens.outputTokens)}
              </Text>
            )}
            {contextLimit && lastInputTokens > 0 && (
              <Text color={contextColor}>
                {' · '}
                {formatTokens(lastInputTokens)}/{formatTokens(contextLimit)} (
                {Math.round(ratio * 100)}%)
              </Text>
            )}
            {compactionActive && <Text color="cyan">{' · compacted'}</Text>}
            {queue.length > 0 && (
              <Text color="yellow">
                {' · '}
                {queue.length} queued
              </Text>
            )}
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

function ChatRowView(props: {
  row: ChatRow;
  placeholder?: string;
  formatUsage: (usage: TokenUsage) => string;
}) {
  const { row, placeholder = '', formatUsage } = props;
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
      {row.kind === 'assistant' && row.usage && <Text dimColor>{formatUsage(row.usage)}</Text>}
    </Box>
  );
}

function sumTokens(rows: ChatRow[]): TokenUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const r of rows) {
    if (r.kind === 'assistant' && r.usage) {
      inputTokens += r.usage.inputTokens;
      outputTokens += r.usage.outputTokens;
    }
  }
  return { inputTokens, outputTokens };
}

function lastTurnInput(rows: ChatRow[]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r && r.kind === 'assistant' && r.usage) return r.usage.inputTokens;
  }
  return 0;
}

function truncateLabel(s: string): string {
  if (s.length <= 30) return s;
  return `${s.slice(0, 29)}…`;
}
