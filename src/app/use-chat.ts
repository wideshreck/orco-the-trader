import { useCallback, useEffect, useRef, useState } from 'react';
import { type ChatMessage, streamChat } from '../ai.js';
import type { CatalogProvider, ModelRef } from '../catalog.js';
import { errorMessage, isAbortError } from '../errors.js';

export type ChatRow = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
};

export type SubmitOutcome = 'sent' | 'empty' | 'busy' | 'no-model';

export function useChat(target: { provider: CatalogProvider; ref: ModelRef } | null) {
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);
  const nextId = useCallback(() => ++idRef.current, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => setMessages([]), []);

  const send = useCallback(
    async (text: string): Promise<SubmitOutcome> => {
      const trimmed = text.trim();
      if (!trimmed) return 'empty';
      if (streaming) return 'busy';
      if (!target) return 'no-model';

      const userMsg: ChatRow = { id: nextId(), role: 'user', content: trimmed };
      const assistantId = nextId();
      const history = [...messages, userMsg];
      setMessages([...history, { id: assistantId, role: 'assistant', content: '' }]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const wire: ChatMessage[] = history.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        let acc = '';
        for await (const chunk of streamChat(
          target.provider,
          target.ref,
          wire,
          controller.signal,
        )) {
          acc += chunk;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { id: assistantId, role: 'assistant', content: acc };
            return copy;
          });
        }
      } catch (err: unknown) {
        const aborted = isAbortError(err);
        const text = aborted ? '(canceled)' : `Error: ${errorMessage(err)}`;
        setMessages((prev) => {
          const copy = [...prev];
          const row: ChatRow = { id: assistantId, role: 'assistant', content: text };
          if (!aborted) row.error = true;
          copy[copy.length - 1] = row;
          return copy;
        });
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
      return 'sent';
    },
    [messages, streaming, target, nextId],
  );

  return { messages, streaming, send, clear, cancel };
}
