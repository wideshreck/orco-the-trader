import { useApp, useInput } from 'ink';
import { useEffect, useMemo, useRef, useState } from 'react';
import { matchCommands } from '../commands/index.js';
import { type ChatFocus, ChatView, type InfoPanel } from '../features/chat/chat-view.js';
import { computeCost, formatUsageLine } from '../features/chat/cost.js';
import { useChat } from '../features/chat/use-chat.js';
import { bootstrapMcp, reloadMcp } from '../features/mcp/index.js';
import { isAuthenticated } from '../features/models/auth.js';
import { AuthPrompt } from '../features/models/auth-prompt.js';
import { type Catalog, findModel, loadCatalog, type ModelRef } from '../features/models/catalog.js';
import { ModelPicker } from '../features/models/model-picker.js';
import { SessionPicker } from '../features/sessions/session-picker.js';
import { useSession } from '../features/sessions/use-session.js';
import { setAlwaysAllowed, setPermissionOverrides } from '../features/tools/index.js';
import { useApproval } from '../features/tools/use-approval.js';
import { type Config, loadConfig, saveConfig } from '../shared/config/user-config.js';
import { errorMessage } from '../shared/errors/index.js';
import { Bootstrap } from '../shared/ui/bootstrap.js';
import { dispatchCommand, type Phase } from './dispatch.js';

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
  const [exitWarning, setExitWarning] = useState(false);
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [suggestionsDismissedFor, setSuggestionsDismissedFor] = useState<string | null>(null);
  const [infoPanel, setInfoPanel] = useState<InfoPanel | null>(null);
  // Messages typed while the assistant is streaming get queued and drained
  // FIFO when the stream settles.
  const [queue, setQueue] = useState<string[]>([]);
  // Up/down arrow cycles through previously-sent user messages when the input
  // is focused and the suggestion dropdown is not open.
  const historyIdxRef = useRef<number | null>(null);
  const draftRef = useRef<string>('');
  const warningTimer = useRef<NodeJS.Timeout | null>(null);

  const rawSuggestions = useMemo(() => matchCommands(input), [input]);
  const suggestions = suggestionsDismissedFor === input ? [] : rawSuggestions;

  // biome-ignore lint/correctness/useExhaustiveDependencies: input is the trigger
  useEffect(() => {
    setSuggestionIdx(0);
  }, [input]);

  const provider = catalog && config.providerId ? catalog[config.providerId] : undefined;
  const target =
    provider && config.providerId && config.modelId
      ? {
          provider,
          ref: { providerId: config.providerId, modelId: config.modelId },
        }
      : null;

  const approval = useApproval();
  const session = useSession();
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

  // Auto-compact when the last turn's input tokens cross 90% of the model's
  // context window. Fires once per turn after the stream settles.
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = chat.streaming;
    if (!wasStreaming || chat.streaming) return;
    if (chat.compactionPoint) return; // already compacted in this session
    if (!target) return;
    const limit = catalog?.[target.ref.providerId]?.models[target.ref.modelId]?.limit?.context;
    if (!limit) return;
    let lastInput = 0;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const r = chat.messages[i];
      if (r?.kind === 'assistant' && r.usage) {
        lastInput = r.usage.inputTokens;
        break;
      }
    }
    if (lastInput / limit < 0.9) return;
    setInfoPanel({
      title: 'auto-compact',
      lines: [
        `  context ${Math.round((lastInput / limit) * 100)}% full — summarizing older messages...`,
      ],
    });
    void chat.compact();
  }, [chat.streaming, chat.compactionPoint, chat.messages, chat.compact, target, catalog]);

  useEffect(() => {
    setPermissionOverrides(config.toolOverrides ?? {});
  }, [config.toolOverrides]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // MCP servers connect in parallel with the catalog load; failures are
        // recorded per-server and the app proceeds without them.
        void bootstrapMcp(config.mcpServers);
        const { catalog: cat } = await loadCatalog();
        if (cancelled) return;
        setCatalog(cat);
        const ref: ModelRef | null =
          config.providerId && config.modelId
            ? { providerId: config.providerId, modelId: config.modelId }
            : null;
        const model = ref ? findModel(cat, ref) : undefined;
        const prov = ref ? cat[ref.providerId] : undefined;
        const authed = prov ? isAuthenticated(prov.id, prov.env) : false;
        setPhase(model && authed ? { kind: 'chat' } : { kind: 'picker' });
      } catch (err: unknown) {
        if (cancelled) return;
        setPhase({
          kind: 'bootstrap',
          status: '',
          error: `failed to load catalog: ${errorMessage(err)}`,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.modelId, config.providerId, config.mcpServers]);

  useInput((ch, key) => {
    if (key.ctrl && ch === 'c') {
      if (chat.streaming) {
        chat.cancel();
        return;
      }
      if (exitWarning) {
        exit();
        return;
      }
      setExitWarning(true);
      if (warningTimer.current) clearTimeout(warningTimer.current);
      warningTimer.current = setTimeout(() => setExitWarning(false), 2000);
      return;
    }
    if (approval.pending) {
      if (ch === 'a') {
        approval.resolve('allow');
        return;
      }
      if (ch === 'd') {
        approval.resolve('deny');
        return;
      }
      if (ch === 'A') {
        setAlwaysAllowed(approval.pending.toolName);
        approval.resolve('always');
        return;
      }
      return;
    }
    if (infoPanel) {
      if (key.escape || key.return || ch === ' ') setInfoPanel(null);
      return;
    }
    if (phase.kind !== 'chat') return;
    if (focus === 'input' && suggestions.length > 0) {
      if (key.upArrow) {
        setSuggestionIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (key.downArrow) {
        setSuggestionIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (key.tab) {
        const pick = suggestions[suggestionIdx];
        if (pick) setInput(pick.name);
        return;
      }
      if (key.escape) {
        setSuggestionsDismissedFor(input);
        return;
      }
    }
    if (focus === 'input' && (key.upArrow || key.downArrow)) {
      const history = chat.messages
        .filter((m): m is { id: number; kind: 'user'; content: string } => m.kind === 'user')
        .map((m) => m.content);
      if (key.upArrow) {
        if (history.length === 0) return;
        if (historyIdxRef.current === null) {
          historyIdxRef.current = 0;
          draftRef.current = input;
        } else if (historyIdxRef.current < history.length - 1) {
          historyIdxRef.current += 1;
        } else {
          return;
        }
        setInput(history[history.length - 1 - historyIdxRef.current] ?? '');
        return;
      }
      // down arrow
      if (historyIdxRef.current === null) {
        setFocus('tools-bar');
        return;
      }
      if (historyIdxRef.current > 0) {
        historyIdxRef.current -= 1;
        setInput(history[history.length - 1 - historyIdxRef.current] ?? '');
      } else {
        historyIdxRef.current = null;
        setInput(draftRef.current);
        draftRef.current = '';
      }
      return;
    }
    if (focus === 'tools-bar') {
      if (key.upArrow || key.escape) setFocus('input');
      else if (key.return) setFocus('tools-panel');
      return;
    }
    if (focus === 'tools-panel' && key.escape) setFocus('tools-bar');
  });

  useEffect(() => {
    return () => {
      if (warningTimer.current) clearTimeout(warningTimer.current);
    };
  }, []);

  const handleSubmit = (value: string) => {
    // A new submission closes any in-progress history browsing.
    historyIdxRef.current = null;
    draftRef.current = '';
    let trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('/') && suggestions.length > 0) {
      const pick = suggestions[suggestionIdx];
      if (pick) trimmed = pick.name;
    }
    // If a stream is in flight or we're waiting on approval, enqueue the
    // submission and let the drain effect flush it later.
    if (chat.streaming || approval.pending) {
      setQueue((q) => [...q, trimmed]);
      setInput('');
      return;
    }
    const result = dispatchCommand(trimmed, {
      setPhase,
      setInfoPanel,
      exit,
      clearChat: () => {
        if (chat.streaming) chat.cancel();
        session.startNew();
        chat.reset({ rows: [], compactionPoint: null });
      },
      compactChat: async () => {
        const outcome = await chat.compact();
        if (outcome === 'too-short') {
          setInfoPanel({
            title: 'compact',
            lines: [
              '  conversation too short to compact',
              '  at least 7 messages needed (~3 turns)',
            ],
          });
        } else if (outcome === 'error') {
          setInfoPanel({
            title: 'compact',
            lines: ['  failed to generate summary', '  try again or check network'],
          });
        } else if (outcome === 'busy') {
          setInfoPanel({
            title: 'compact',
            lines: ['  stream is still running', '  wait or ctrl+c first'],
          });
        } else if (outcome === 'compacted') {
          setInfoPanel({
            title: 'compact',
            lines: ['  ✓ older messages summarized', '  context trimmed for next turns'],
          });
        }
      },
      messages: chat.messages,
      catalog: catalog ?? {},
      ref: target?.ref ?? { providerId: '', modelId: '' },
      ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
      config: {
        ...(config.providerId ? { providerId: config.providerId } : {}),
        ...(config.modelId ? { modelId: config.modelId } : {}),
        mcpServerCount: Object.keys(config.mcpServers ?? {}).length,
      },
      reloadMcpServers: () => {
        // Fire-and-forget: /mcp will show updated status once it settles.
        void reloadMcp(loadConfig().mcpServers);
      },
    });
    setInput('');
    if (result === 'send') void chat.send(trimmed);
  };
  handleSubmitRef.current = handleSubmit;

  if (phase.kind === 'bootstrap') {
    return <Bootstrap status={phase.status} error={phase.error ?? null} />;
  }

  if (phase.kind === 'picker' && catalog) {
    const current: ModelRef | undefined =
      config.providerId && config.modelId
        ? { providerId: config.providerId, modelId: config.modelId }
        : undefined;
    return (
      <ModelPicker
        catalog={catalog}
        {...(current ? { current } : {})}
        onCancel={() => {
          if (config.providerId && config.modelId) setPhase({ kind: 'chat' });
        }}
        onPick={(ref, authed) => {
          const next: Config = { providerId: ref.providerId, modelId: ref.modelId };
          setConfig(next);
          saveConfig(next);
          setPhase(authed ? { kind: 'chat' } : { kind: 'auth', providerId: ref.providerId });
        }}
      />
    );
  }

  if (phase.kind === 'auth' && catalog) {
    const prov = catalog[phase.providerId];
    if (!prov) {
      setPhase({ kind: 'picker' });
      return null;
    }
    return (
      <AuthPrompt
        provider={prov}
        onCancel={() => setPhase({ kind: 'picker' })}
        onDone={() => setPhase({ kind: 'chat' })}
      />
    );
  }

  if (phase.kind === 'sessions') {
    return (
      <SessionPicker
        sessions={session.list()}
        currentId={session.currentId}
        onCancel={() => setPhase({ kind: 'chat' })}
        onPick={(id) => {
          const load = session.switchTo(id);
          chat.reset(load);
          setPhase({ kind: 'chat' });
        }}
        onDelete={(id) => {
          session.remove(id);
        }}
      />
    );
  }

  if (!catalog || !target || !session.ready) {
    return <Bootstrap status="..." />;
  }

  const modelLabel = `${target.ref.providerId}/${target.ref.modelId}`;
  const sessionMeta = session.currentId
    ? session.list().find((s) => s.id === session.currentId)
    : undefined;
  const sessionLabel = sessionMeta ? sessionMeta.title : 'new session';
  const formatUsage = (usage: { inputTokens: number; outputTokens: number }) =>
    formatUsageLine(usage, computeCost(usage, catalog, target.ref));
  const contextLimit =
    catalog[target.ref.providerId]?.models[target.ref.modelId]?.limit?.context ?? null;

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
      infoPanel={infoPanel}
      formatUsage={formatUsage}
      contextLimit={contextLimit}
      compactionActive={chat.compactionPoint !== null}
      queue={queue}
    />
  );
}
