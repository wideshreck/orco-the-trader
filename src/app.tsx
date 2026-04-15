import { useApp, useInput } from 'ink';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type ChatFocus, ChatView } from './app/chat-view.js';
import { matchCommands } from './app/commands.js';
import { useChat } from './app/use-chat.js';
import { isAuthenticated } from './auth.js';
import { type Catalog, findModel, loadCatalog, type ModelRef } from './catalog.js';
import { type Config, loadConfig, saveConfig } from './config.js';
import { errorMessage } from './errors.js';
import { AuthPrompt } from './ui/auth-prompt.js';
import { Bootstrap } from './ui/bootstrap.js';
import { ModelPicker } from './ui/model-picker.js';

type Phase =
  | { kind: 'bootstrap'; status: string; error?: string | null }
  | { kind: 'picker' }
  | { kind: 'auth'; providerId: string }
  | { kind: 'chat' };

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
  const warningTimer = useRef<NodeJS.Timeout | null>(null);

  const suggestions = useMemo(() => matchCommands(input), [input]);

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

  const chat = useChat(target);

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
    if (phase.kind !== 'chat') return;
    if (focus === 'input' && suggestions.length > 0) {
      if (key.upArrow) {
        setSuggestionIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSuggestionIdx((i) => Math.min(suggestions.length - 1, i + 1));
        return;
      }
      if (key.tab) {
        const pick = suggestions[suggestionIdx];
        if (pick) setInput(pick.name);
        return;
      }
      if (key.escape) {
        setInput('');
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
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed === '/model') {
      setInput('');
      setPhase({ kind: 'picker' });
      return;
    }
    if (trimmed === '/clear') {
      chat.clear();
      setInput('');
      return;
    }
    if (trimmed === '/exit') {
      exit();
      return;
    }
    setInput('');
    void chat.send(trimmed);
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

  if (!catalog || !target) {
    return <Bootstrap status="..." />;
  }

  const modelLabel = `${target.ref.providerId}/${target.ref.modelId}`;

  return (
    <ChatView
      modelLabel={modelLabel}
      messages={chat.messages}
      streaming={chat.streaming}
      input={input}
      onInputChange={setInput}
      onSubmit={handleSubmit}
      focus={focus}
      exitWarning={exitWarning}
      suggestions={suggestions}
      suggestionIdx={suggestionIdx}
    />
  );
}
