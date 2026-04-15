import { useCallback, useRef, useState } from 'react';
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

  return {
    pending: pending
      ? pending.choices
        ? { question: pending.question, choices: pending.choices }
        : { question: pending.question }
      : null,
    asker,
    resolve,
  };
}
