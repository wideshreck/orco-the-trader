import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { loadConfig, saveConfig } from './config.js';
import { loadCatalog, findModel, type Catalog, type ModelRef } from './catalog.js';
import { isAuthenticated } from './auth.js';
import { streamChat, type ChatMessage } from './ai.js';
import { ModelPicker } from './ui/model-picker.js';
import { AuthPrompt } from './ui/auth-prompt.js';
import { Bootstrap } from './ui/bootstrap.js';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
};

type Phase =
  | { kind: 'bootstrap'; status: string; error?: string | null }
  | { kind: 'picker' }
  | { kind: 'auth'; providerId: string }
  | { kind: 'chat' };

type Focus = 'input' | 'tools-bar' | 'tools-panel';

export function App() {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>({
    kind: 'bootstrap',
    status: 'katalog yükleniyor...',
  });
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [config, setConfig] = useState(() => loadConfig());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [exitWarning, setExitWarning] = useState(false);
  const [focus, setFocus] = useState<Focus>('input');
  const warningTimer = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { catalog, stale } = await loadCatalog();
        if (cancelled) return;
        setCatalog(catalog);
        const currentRef: ModelRef | null =
          config.providerId && config.modelId
            ? { providerId: config.providerId, modelId: config.modelId }
            : null;
        const currentModel = currentRef ? findModel(catalog, currentRef) : undefined;
        const currentProvider = currentRef ? catalog[currentRef.providerId] : undefined;
        const authed = currentProvider && isAuthenticated(currentProvider.id, currentProvider.env);
        if (currentModel && authed) {
          setPhase({ kind: 'chat' });
        } else {
          setPhase({ kind: 'picker' });
        }
        if (stale) {
          // non-fatal; catalog came from stale cache
        }
      } catch (err: any) {
        if (cancelled) return;
        setPhase({
          kind: 'bootstrap',
          status: '',
          error: `katalog yüklenemedi: ${err?.message ?? err}`,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useInput((ch, key) => {
    if (key.ctrl && ch === 'c') {
      if (streaming && abortRef.current) {
        abortRef.current.abort();
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

    if (focus === 'input' && key.downArrow) {
      setFocus('tools-bar');
      return;
    }
    if (focus === 'tools-bar') {
      if (key.upArrow || key.escape) {
        setFocus('input');
        return;
      }
      if (key.return) {
        setFocus('tools-panel');
        return;
      }
    }
    if (focus === 'tools-panel' && key.escape) {
      setFocus('tools-bar');
      return;
    }
  });

  useEffect(() => {
    return () => {
      if (warningTimer.current) clearTimeout(warningTimer.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const handleSubmit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || streaming || !catalog) return;

    if (trimmed === '/model') {
      setInput('');
      setPhase({ kind: 'picker' });
      return;
    }
    if (trimmed === '/clear') {
      setMessages([]);
      setInput('');
      return;
    }
    if (trimmed === '/exit' || trimmed === '/quit') {
      exit();
      return;
    }

    if (!config.providerId || !config.modelId) return;
    const provider = catalog[config.providerId];
    if (!provider) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    const nextHistory = [...messages, userMsg];
    setMessages([...nextHistory, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history: ChatMessage[] = nextHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      let acc = '';
      for await (const chunk of streamChat(
        provider,
        { providerId: config.providerId, modelId: config.modelId },
        history,
        controller.signal,
      )) {
        acc += chunk;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: acc };
          return copy;
        });
      }
    } catch (err: any) {
      const msg =
        err?.name === 'AbortError' ? '(iptal edildi)' : `Hata: ${err?.message ?? String(err)}`;
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: 'assistant',
          content: msg,
          error: err?.name !== 'AbortError',
        };
        return copy;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  if (phase.kind === 'bootstrap') {
    return <Bootstrap status={phase.status} error={phase.error} />;
  }

  if (phase.kind === 'picker' && catalog) {
    return (
      <ModelPicker
        catalog={catalog}
        current={
          config.providerId && config.modelId
            ? { providerId: config.providerId, modelId: config.modelId }
            : undefined
        }
        onCancel={() => {
          if (config.providerId && config.modelId) {
            setPhase({ kind: 'chat' });
          }
        }}
        onPick={(ref, authed) => {
          const next = { providerId: ref.providerId, modelId: ref.modelId };
          setConfig(next);
          saveConfig(next);
          if (authed) {
            setPhase({ kind: 'chat' });
          } else {
            setPhase({ kind: 'auth', providerId: ref.providerId });
          }
        }}
      />
    );
  }

  if (phase.kind === 'auth' && catalog) {
    const provider = catalog[phase.providerId];
    if (!provider) {
      setPhase({ kind: 'picker' });
      return null;
    }
    return (
      <AuthPrompt
        provider={provider}
        onCancel={() => setPhase({ kind: 'picker' })}
        onDone={() => setPhase({ kind: 'chat' })}
      />
    );
  }

  if (!catalog || !config.providerId || !config.modelId) {
    return <Bootstrap status="..." />;
  }

  const currentProvider = catalog[config.providerId];
  const currentModel = currentProvider?.models[config.modelId];
  const label = currentModel ? `${config.providerId}/${currentModel.id}` : 'model seçilmedi';

  return (
    <Box flexDirection="column" padding={1}>
      <Box
        flexDirection="column"
        alignItems="center"
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        marginBottom={1}
      >
        <Text color="cyan" bold>
          {'     ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗'}
        </Text>
        <Text color="cyan" bold>
          {'     ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝'}
        </Text>
        <Text color="cyan" bold>
          {'     ██║███████║██████╔╝██║   ██║██║███████╗'}
        </Text>
        <Text color="cyan" bold>
          {'██   ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║'}
        </Text>
        <Text color="cyan" bold>
          {'╚█████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║███████║'}
        </Text>
        <Text color="cyan" bold>
          {' ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝'}
        </Text>
        <Box marginTop={1}>
          <Text dimColor>The Trader v0.1 · </Text>
          <Text color="magenta">{label}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {messages.length === 0 && (
          <Text dimColor>Mesaj yaz ve enter'a bas · /model model seç · /clear geçmişi temizle</Text>
        )}
        {messages.map((msg, i) => (
          <Box key={i} flexDirection="column" marginBottom={1}>
            <Text color={msg.role === 'user' ? 'green' : 'magenta'} bold>
              {msg.role === 'user' ? '› you' : '‹ jarvis'}
            </Text>
            <Text color={msg.error ? 'red' : undefined}>
              {msg.content || (streaming && i === messages.length - 1 ? '…' : '')}
            </Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column">
        <Box
          borderStyle="round"
          borderColor={focus === 'input' && input.length > 0 ? 'cyan' : 'gray'}
          paddingX={1}
        >
          <Text color="cyan" bold>
            {'$ '}
          </Text>
          <Box flexGrow={1}>
            {focus === 'input' && !streaming ? (
              <TextInput
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                placeholder="jarvis'e bir şey sor... (/model, /clear)"
                showCursor
              />
            ) : (
              <Text dimColor>
                {streaming
                  ? 'jarvis yazıyor... (ctrl+c iptal)'
                  : input || "jarvis'e bir şey sor..."}
              </Text>
            )}
          </Box>
        </Box>

        <Box paddingX={2} justifyContent="space-between">
          <Box>
            <Text
              color={focus === 'tools-bar' ? 'cyan' : undefined}
              dimColor={focus !== 'tools-bar'}
              inverse={focus === 'tools-bar'}
            >
              {focus === 'tools-bar' ? ' tools ' : 'tools'}
            </Text>
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
              <Text dimColor>henüz tool yok — yakında...</Text>
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
