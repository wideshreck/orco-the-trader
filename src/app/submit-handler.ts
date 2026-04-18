import type { SlashCommand } from '../commands/index.js';
import type { InfoPanel } from '../features/chat/chat-view.js';
import type { ChatRow, CompactOutcome } from '../features/chat/use-chat.js';
import { reloadMcp } from '../features/mcp/index.js';
import type { Catalog, ModelRef } from '../features/models/catalog.js';
import type { ApprovalChannel } from '../features/tools/use-approval.js';
import { type Config, loadConfig } from '../shared/config/user-config.js';
import { dispatchCommand, type Phase } from './dispatch.js';

export type SubmitDeps = {
  chatStreaming: boolean;
  cancelChat: () => void;
  sendChat: (text: string) => void;
  clearChatState: () => void;
  compact: () => Promise<CompactOutcome>;
  approval: ApprovalChannel;
  setQueue: (updater: (q: string[]) => string[]) => void;
  setInput: (v: string) => void;
  setPhase: (p: Phase) => void;
  setInfoPanel: (p: InfoPanel | null) => void;
  exit: () => void;
  startNewSession: () => void;
  resetHistoryCursor: () => void;
  messages: ChatRow[];
  catalog: Catalog | null;
  target: { ref: ModelRef } | null;
  config: Config;
  suggestions: SlashCommand[];
  suggestionIdx: number;
  previousSessionShortId?: string;
};

// Builds the handleSubmit callback. Wraps dispatchCommand with the side
// effects the chat UI expects (queueing while streaming, clearing input,
// flushing the history cursor). Extracted so app.tsx stays under 300 lines.
export function buildSubmitHandler(deps: SubmitDeps): (value: string) => void {
  return (value: string) => {
    deps.resetHistoryCursor();
    let trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('/') && deps.suggestions.length > 0) {
      const pick = deps.suggestions[deps.suggestionIdx];
      if (pick) trimmed = pick.name;
    }
    if (deps.chatStreaming || deps.approval.pending) {
      deps.setQueue((q) => [...q, trimmed]);
      deps.setInput('');
      return;
    }
    const result = dispatchCommand(trimmed, {
      setPhase: deps.setPhase,
      setInfoPanel: deps.setInfoPanel,
      exit: deps.exit,
      clearChat: () => {
        if (deps.chatStreaming) deps.cancelChat();
        const savedId = deps.previousSessionShortId;
        deps.startNewSession();
        deps.clearChatState();
        process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
        // Lets the user know the previous turn isn't lost — it's on disk
        // and restorable via /sessions. Clears itself with the next action.
        if (savedId) {
          deps.setInfoPanel({
            title: 'new session',
            lines: [
              `  previous session saved (${savedId}) — /sessions to restore`,
              '  starting fresh',
            ],
          });
        }
      },
      compactChat: async () => {
        const outcome = await deps.compact();
        deps.setInfoPanel(buildCompactPanel(outcome));
      },
      messages: deps.messages,
      catalog: deps.catalog ?? {},
      ref: deps.target?.ref ?? { providerId: '', modelId: '' },
      ...(deps.config.systemPrompt ? { systemPrompt: deps.config.systemPrompt } : {}),
      config: {
        ...(deps.config.providerId ? { providerId: deps.config.providerId } : {}),
        ...(deps.config.modelId ? { modelId: deps.config.modelId } : {}),
        mcpServerCount: Object.keys(deps.config.mcpServers ?? {}).length,
      },
      reloadMcpServers: () => {
        void reloadMcp(loadConfig().mcpServers);
      },
    });
    deps.setInput('');
    if (result === 'send') deps.sendChat(trimmed);
  };
}

function buildCompactPanel(outcome: CompactOutcome): InfoPanel | null {
  switch (outcome) {
    case 'too-short':
      return {
        title: 'compact',
        lines: ['  conversation too short to compact', '  at least 7 messages needed (~3 turns)'],
      };
    case 'error':
      return {
        title: 'compact',
        lines: ['  failed to generate summary', '  try again or check network'],
      };
    case 'busy':
      return {
        title: 'compact',
        lines: ['  stream is still running', '  wait or ctrl+c first'],
      };
    case 'compacted':
      return {
        title: 'compact',
        lines: ['  ✓ older messages summarized', '  context trimmed for next turns'],
      };
    case 'no-model':
      return null;
  }
}
