import { useCallback, useMemo, useRef, useState } from 'react';
import type { Asker, QuestionRequest } from './index.js';

type Pending = QuestionRequest & { resolve: (answer: string) => void };

export type QuestionChannel = {
  pending: QuestionRequest | null;
  asker: Asker;
  resolve: (answer: string) => void;
};

export function useQuestion(): QuestionChannel {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const asker = useCallback<Asker>(async (req) => {
    return new Promise<string>((resolve) => {
      const entry: Pending = { ...req, resolve };
      pendingRef.current = entry;
      setPending(entry);
    });
  }, []);

  const resolve = useCallback((answer: string) => {
    const entry = pendingRef.current;
    if (!entry) return;
    pendingRef.current = null;
    setPending(null);
    entry.resolve(answer);
  }, []);

  // Memoize the public view so `pending`'s identity only changes when a new
  // question arrives (not on every render). Effects that depend on it can then
  // reliably distinguish "new question" from "same question, re-render".
  const view = useMemo<QuestionRequest | null>(() => {
    if (!pending) return null;
    if (pending.choices) return { question: pending.question, choices: pending.choices };
    return { question: pending.question };
  }, [pending]);

  return { pending: view, asker, resolve };
}
