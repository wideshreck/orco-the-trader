import { useApp } from 'ink';
import { useEffect, useMemo, useRef, useState } from 'react';
import { matchCommands } from '../commands/index.js';
import type { ChatFocus, InfoPanel } from '../features/chat/chat-view.js';
import { ChatView } from '../features/chat/chat-view.js';
import { computeCost, formatUsageLine, totalSessionCost } from '../features/chat/cost.js';
import { useChat } from '../features/chat/use-chat.js';
import type { Catalog } from '../features/models/catalog.js';
import { useSession } from '../features/sessions/use-session.js';
import { setTodoSink, type Todo } from '../features/todos/index.js';
import { setPermissionOverrides, setQuestionAsker } from '../features/tools/index.js';
import { useApproval } from '../features/tools/use-approval.js';
import { useQuestion } from '../features/tools/use-question.js';
import { type Config, loadConfig } from '../shared/config/user-config.js';
import { Bootstrap } from '../shared/ui/bootstrap.js';
import type { Phase } from './dispatch.js';
import { renderPhase } from './phase-router.js';
import { buildSubmitHandler } from './submit-handler.js';
import { useAppInput } from './use-app-input.js';
import { useAutoCompact } from './use-auto-compact.js';
import { type McpSnapshot, useBootstrap } from './use-bootstrap.js';

export function App() {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>({
    kind: 'bootstrap',
    status: 'loading catalog...',
  });
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [config, setConfig] = useState<Config>(() => loadConfig());
  const [input, setInput] = useState('');
  const [focus, setFocus] = useState<ChatFocus>('input');
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [suggestionsDismissedFor, setSuggestionsDismissedFor] = useState<string | null>(null);
  const [infoPanel, setInfoPanel] = useState<InfoPanel | null>(null);
  // Messages typed while the assistant is streaming get queued and drained
  // FIFO when the stream settles.
  const [queue, setQueue] = useState<string[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  // Bumped on terminal resize. Changing Static item keys forces Ink to re-emit
  // all scrollback rows at the new width. Combined with a synchronous screen
  // clear this rebuilds the entire view cleanly.
  const [resizeEpoch, setResizeEpoch] = useState(0);
  const [catalogStale, setCatalogStale] = useState(false);
  const [mcpSnapshot, setMcpSnapshot] = useState<McpSnapshot>({
    ready: 0,
    connecting: 0,
    failed: 0,
  });
  const [approvalExpanded, setApprovalExpanded] = useState(false);

  const rawSuggestions = useMemo(() => matchCommands(input), [input]);
  const suggestions = suggestionsDismissedFor === input ? [] : rawSuggestions;

  // biome-ignore lint/correctness/useExhaustiveDependencies: input is the trigger
  useEffect(() => {
    setSuggestionIdx(0);
    // Editing the input invalidates any prior "Esc dismissed" state — the
    // user is clearly composing a new slash, so we want fresh suggestions.
    setSuggestionsDismissedFor(null);
  }, [input]);

  useEffect(() => {
    const onResize = () => {
      // Clear viewport + scrollback so old wraps vanish, then bump the epoch
      // so Static re-keys all items and Ink re-emits them at the new width.
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
      setResizeEpoch((e) => e + 1);
    };
    process.stdout.prependListener('resize', onResize);
    return () => {
      process.stdout.removeListener('resize', onResize);
    };
  }, []);

  const provider = catalog && config.providerId ? catalog[config.providerId] : undefined;
  const target =
    provider && config.providerId && config.modelId
      ? {
          provider,
          ref: { providerId: config.providerId, modelId: config.modelId },
        }
      : null;

  const approval = useApproval();
  const question = useQuestion();
  const [questionDraft, setQuestionDraft] = useState('');
  const session = useSession();

  // Wire the module-level asker so the `ask_user` builtin tool routes questions
  // through the current UI.
  useEffect(() => {
    setQuestionAsker(question.asker);
    return () => setQuestionAsker(null);
  }, [question.asker]);

  // Same pattern for the `todo_write` tool — it publishes list snapshots here.
  useEffect(() => {
    setTodoSink(setTodos);
    return () => setTodoSink(null);
  }, []);

  // Reset the answer draft whenever a new question arrives.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on question transitions
  useEffect(() => {
    setQuestionDraft('');
  }, [question.pending]);
  const chat = useChat(target, approval.approver, {
    seedRows: session.initial.rows,
    seedCompactionPoint: session.initial.compactionPoint,
    ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
    onCommit: (row) => {
      session.recordRow(
        row,
        target ? { providerId: target.ref.providerId, modelId: target.ref.modelId } : undefined,
      );
    },
    onCompact: (cp) => session.recordCompact(cp),
  });

  // Safety: if stream ends with an unresolved approval (e.g. user aborted), deny it.
  useEffect(() => {
    if (!chat.streaming && approval.pending) {
      approval.resolve('deny');
    }
  }, [chat.streaming, approval]);

  // Clear todos when the user starts a fresh session/new chat.
  useEffect(() => {
    if (chat.messages.length === 0) setTodos([]);
  }, [chat.messages.length]);

  // Drain one queued submission each time the stream settles. Running it via
  // handleSubmitRef.current keeps slash-command dispatch consistent for queued
  // inputs without pulling handleSubmit into the effect's dep list.
  const handleSubmitRef = useRef<(v: string) => void>(() => undefined);
  useEffect(() => {
    if (chat.streaming) return;
    if (approval.pending) return;
    if (queue.length === 0) return;
    const [next, ...rest] = queue;
    if (!next) return;
    setQueue(rest);
    handleSubmitRef.current(next);
  }, [chat.streaming, approval.pending, queue]);

  useAutoCompact({
    streaming: chat.streaming,
    compactionPoint: chat.compactionPoint,
    messages: chat.messages,
    compact: chat.compact,
    target,
    catalog,
    setInfoPanel,
  });

  useEffect(() => {
    setPermissionOverrides(config.toolOverrides ?? {});
  }, [config.toolOverrides]);

  useBootstrap({ config, setCatalog, setCatalogStale, setMcpSnapshot, setPhase });

  // Reset expand state every time a fresh approval pops so the next prompt
  // starts collapsed — otherwise a user who expanded the previous call sees
  // the next one pre-expanded, which is noisy.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on approval pending change
  useEffect(() => {
    setApprovalExpanded(false);
  }, [approval.pending]);

  const { exitWarning, resetHistoryCursor } = useAppInput({
    phase,
    chatStreaming: chat.streaming,
    cancelChat: chat.cancel,
    exit,
    approval,
    toggleApprovalExpand: () => setApprovalExpanded((v) => !v),
    question,
    infoPanel,
    setInfoPanel,
    focus,
    setFocus,
    suggestions,
    suggestionIdx,
    setSuggestionIdx,
    setSuggestionsDismissedFor,
    input,
    setInput,
    messages: chat.messages,
  });

  const handleSubmit = buildSubmitHandler({
    chatStreaming: chat.streaming,
    cancelChat: chat.cancel,
    sendChat: (t) => void chat.send(t),
    clearChatState: chat.clear,
    compact: chat.compact,
    approval,
    setQueue,
    setInput,
    setPhase,
    setInfoPanel,
    exit,
    startNewSession: session.startNew,
    resetHistoryCursor,
    messages: chat.messages,
    catalog,
    target,
    config,
    suggestions,
    suggestionIdx,
    ...(session.currentId ? { previousSessionShortId: session.currentId.slice(0, 8) } : {}),
  });
  handleSubmitRef.current = handleSubmit;

  const phaseView = renderPhase({
    phase,
    mcpSnapshot,
    catalog,
    config,
    setConfig,
    setPhase,
    session,
    resetChat: chat.reset,
  });
  if (phaseView) return <>{phaseView}</>;
  if (!catalog || !target || !session.ready) {
    return <Bootstrap status="..." />;
  }

  const modelLabel = `${target.ref.providerId}/${target.ref.modelId}`;
  const sessionMeta = session.list().find((s) => s.id === session.currentId);
  const sessionLabel = sessionMeta?.title ?? 'new session';
  const formatUsage = (usage: { inputTokens: number; outputTokens: number }) =>
    formatUsageLine(usage, computeCost(usage, catalog, target.ref));
  const contextLimit =
    catalog[target.ref.providerId]?.models[target.ref.modelId]?.limit?.context ?? null;
  const totalCost = totalSessionCost(chat.messages, catalog, target.ref);

  return (
    <ChatView
      modelLabel={modelLabel}
      sessionLabel={sessionLabel}
      scrollback={chat.scrollback}
      live={chat.live}
      streaming={chat.streaming}
      input={input}
      onInputChange={setInput}
      onSubmit={handleSubmit}
      focus={focus}
      exitWarning={exitWarning}
      suggestions={suggestions}
      suggestionIdx={suggestionIdx}
      approval={approval.pending}
      approvalExpanded={approvalExpanded}
      infoPanel={infoPanel}
      formatUsage={formatUsage}
      totalCost={totalCost}
      contextLimit={contextLimit}
      compactionActive={chat.compactionPoint !== null}
      catalogStale={catalogStale}
      queue={queue}
      question={question.pending}
      questionDraft={questionDraft}
      onQuestionDraftChange={setQuestionDraft}
      onQuestionSubmit={(ans) => question.resolve(ans)}
      todos={todos}
      resizeEpoch={resizeEpoch}
    />
  );
}
