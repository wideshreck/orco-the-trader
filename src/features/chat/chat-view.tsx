import { Box, Static, Text } from 'ink';
import type { SlashCommand } from '../../commands/index.js';
import { MultiLineInput } from '../../shared/ui/multi-line-input.js';
import { type Todo, TodosView } from '../todos/index.js';
import { ApprovalPrompt } from '../tools/approval-prompt.js';
import type { ApprovalRequest, QuestionRequest, TokenUsage } from '../tools/index.js';
import { QuestionPrompt } from '../tools/question-prompt.js';
import { ChatRowView, lastTurnInput, sumTokens } from './chat-row-view.js';
import type { CostBreakdown } from './cost.js';
import { InfoPanelView } from './info-panel.js';
import { QueuePreview } from './queue-preview.js';
import { StatusBar } from './status-bar.js';
import type { ChatRow } from './types.js';

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
  approvalExpanded: boolean;
  infoPanel: InfoPanel | null;
  formatUsage: (usage: TokenUsage) => string;
  totalCost: CostBreakdown | null;
  contextLimit: number | null;
  compactionActive: boolean;
  catalogStale: boolean;
  queue: string[];
  question: QuestionRequest | null;
  questionDraft: string;
  onQuestionDraftChange: (v: string) => void;
  onQuestionSubmit: (answer: string) => void;
  todos: Todo[];
  resizeEpoch: number;
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
    approvalExpanded,
    infoPanel,
  } = props;
  const {
    queue,
    question,
    questionDraft,
    onQuestionDraftChange,
    onQuestionSubmit,
    todos,
    resizeEpoch,
  } = props;
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
  const contextWarn = ratio >= 0.9;

  return (
    <>
      <Static items={visibleScrollback}>
        {(row) => (
          <Box key={`${row.id}-${resizeEpoch}`} paddingX={2}>
            <ChatRowView row={row} formatUsage={props.formatUsage} />
          </Box>
        )}
      </Static>

      <Box flexDirection="column" paddingX={2}>
        <Box flexDirection="column" marginBottom={live.length > 0 ? 1 : 0}>
          {live.length === 0 && scrollback.length === 0 && (
            <Text dimColor>type a message and press enter · /help for commands</Text>
          )}
          {live.map((msg, i) => {
            const isLastAssistant = msg.kind === 'assistant' && i === live.length - 1 && streaming;
            if (msg.kind === 'assistant' && !msg.content && !msg.error && !isLastAssistant) {
              return null;
            }
            return (
              <ChatRowView
                key={msg.id}
                row={msg}
                thinking={isLastAssistant}
                formatUsage={props.formatUsage}
              />
            );
          })}
        </Box>

        <TodosView todos={todos} />
        {approval && <ApprovalPrompt request={approval} expanded={approvalExpanded} />}
        {question && (
          <QuestionPrompt
            request={question}
            draft={questionDraft}
            onDraftChange={onQuestionDraftChange}
            onSubmit={onQuestionSubmit}
            isActive={questionInputActive}
          />
        )}
        {infoPanel && <InfoPanelView panel={infoPanel} />}
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

        <QueuePreview queue={queue} />

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
            <Text color="red">
              [!] context {Math.round(ratio * 100)}% full — /compact to summarize older messages
            </Text>
          </Box>
        )}
        {props.catalogStale && (
          <Box>
            <Text color="yellow">[!] using cached model catalog — models.dev unreachable</Text>
          </Box>
        )}
        <StatusBar
          modelLabel={modelLabel}
          sessionLabel={sessionLabel}
          totalTokens={totalTokens}
          totalCost={props.totalCost}
          lastInputTokens={lastInputTokens}
          contextLimit={contextLimit}
          compactionActive={compactionActive}
          queueCount={queue.length}
          focus={focus}
          exitWarning={exitWarning}
        />

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
