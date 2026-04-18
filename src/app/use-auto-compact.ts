import { useEffect, useRef } from 'react';
import type { InfoPanel } from '../features/chat/chat-view.js';
import type { ChatRow, CompactOutcome } from '../features/chat/use-chat.js';
import type { Catalog, ModelRef } from '../features/models/catalog.js';

export type AutoCompactDeps = {
  streaming: boolean;
  compactionPoint: unknown;
  messages: ChatRow[];
  compact: () => Promise<CompactOutcome>;
  target: { ref: ModelRef } | null;
  catalog: Catalog | null;
  setInfoPanel: (p: InfoPanel | null) => void;
};

// Fires once per turn when the last turn's input tokens crossed 90% of the
// model's context window — summarizes older messages before the next send.
export function useAutoCompact(deps: AutoCompactDeps): void {
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = deps.streaming;
    if (!wasStreaming || deps.streaming) return;
    if (deps.compactionPoint) return;
    if (!deps.target) return;
    const limit =
      deps.catalog?.[deps.target.ref.providerId]?.models[deps.target.ref.modelId]?.limit?.context;
    if (!limit) return;
    let lastInput = 0;
    for (let i = deps.messages.length - 1; i >= 0; i--) {
      const r = deps.messages[i];
      if (r?.kind === 'assistant' && r.usage) {
        lastInput = r.usage.inputTokens;
        break;
      }
    }
    if (lastInput / limit < 0.9) return;
    deps.setInfoPanel({
      title: 'auto-compact',
      lines: [
        `  context ${Math.round((lastInput / limit) * 100)}% full — summarizing older messages...`,
      ],
    });
    void deps.compact();
  }, [
    deps.streaming,
    deps.compactionPoint,
    deps.messages,
    deps.compact,
    deps.target,
    deps.catalog,
    deps.setInfoPanel,
  ]);
}
