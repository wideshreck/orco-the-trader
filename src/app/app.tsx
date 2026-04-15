import { useApp, useInput } from 'ink';
import { useEffect, useMemo, useRef, useState } from 'react';
import { matchCommands } from '../commands/index.js';
import { type ChatFocus, ChatView, type InfoPanel } from '../features/chat/chat-view.js';
import { computeCost, formatUsageLine } from '../features/chat/cost.js';
import { useChat } from '../features/chat/use-chat.js';
import { isAuthenticated } from '../features/models/auth.js';
import { AuthPrompt } from '../features/models/auth-prompt.js';
import { type Catalog, findModel, loadCatalog, type ModelRef } from '../features/models/catalog.js';
import { ModelPicker } from '../features/models/model-picker.js';
import { SessionPicker } from '../features/sessions/session-picker.js';
import { useSession } from '../features/sessions/use-session.js';
import { setAlwaysAllowed } from '../features/tools/index.js';
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
  }, [config.modelId, config.providerId]);

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
    if (focus === 'input' && key.downArrow) {
      setFocus('tools-bar');
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
    let trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('/') && suggestions.length > 0) {
      const pick = suggestions[suggestionIdx];
      if (pick) trimmed = pick.name;
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
    });
    setInput('');
    if (result === 'send') void chat.send(trimmed);
  };

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
    />
  );
}
