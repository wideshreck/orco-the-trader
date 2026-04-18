import { useInput } from 'ink';
import { useEffect, useRef, useState } from 'react';
import type { SlashCommand } from '../commands/index.js';
import type { ChatFocus, InfoPanel } from '../features/chat/chat-view.js';
import type { ChatRow } from '../features/chat/use-chat.js';
import { setAlwaysAllowed } from '../features/tools/index.js';
import type { ApprovalChannel } from '../features/tools/use-approval.js';
import type { QuestionChannel } from '../features/tools/use-question.js';
import type { Phase } from './dispatch.js';

export type AppInputDeps = {
  phase: Phase;
  chatStreaming: boolean;
  cancelChat: () => void;
  exit: () => void;
  approval: ApprovalChannel;
  toggleApprovalExpand: () => void;
  question: QuestionChannel;
  infoPanel: InfoPanel | null;
  setInfoPanel: (p: InfoPanel | null) => void;
  focus: ChatFocus;
  setFocus: (f: ChatFocus) => void;
  suggestions: SlashCommand[];
  suggestionIdx: number;
  setSuggestionIdx: (updater: (i: number) => number) => void;
  setSuggestionsDismissedFor: (v: string | null) => void;
  input: string;
  setInput: (v: string) => void;
  messages: ChatRow[];
};

export type AppInputApi = {
  exitWarning: boolean;
  resetHistoryCursor: () => void;
};

// Root-level keyboard router. Lives outside app.tsx so the component stays
// under the 300-line cap; all state it touches is passed in via deps.
export function useAppInput(deps: AppInputDeps): AppInputApi {
  const [exitWarning, setExitWarning] = useState(false);
  const warningTimer = useRef<NodeJS.Timeout | null>(null);
  const historyIdxRef = useRef<number | null>(null);
  const draftRef = useRef<string>('');

  useInput((ch, key) => {
    if (key.ctrl && ch === 'c') {
      if (deps.chatStreaming) {
        deps.cancelChat();
        return;
      }
      if (exitWarning) {
        deps.exit();
        return;
      }
      setExitWarning(true);
      if (warningTimer.current) clearTimeout(warningTimer.current);
      warningTimer.current = setTimeout(() => setExitWarning(false), 2000);
      return;
    }
    if (deps.approval.pending) {
      if (ch === 'a') {
        deps.approval.resolve('allow');
        return;
      }
      if (ch === 'd' || key.escape) {
        deps.approval.resolve('deny');
        return;
      }
      if (ch === 'A') {
        setAlwaysAllowed(deps.approval.pending.toolName);
        deps.approval.resolve('always');
        return;
      }
      if (ch === 'e' || ch === 'E') {
        deps.toggleApprovalExpand();
        return;
      }
      return;
    }
    if (deps.question.pending) {
      const choices = deps.question.pending.choices;
      if (key.escape) {
        deps.question.resolve('');
        return;
      }
      if (choices && ch && /^[1-9]$/.test(ch)) {
        const idx = Number(ch) - 1;
        if (idx < choices.length) {
          const picked = choices[idx];
          if (picked !== undefined) deps.question.resolve(picked);
        }
        return;
      }
      return;
    }
    if (deps.infoPanel) {
      if (key.escape || key.return || ch === ' ') deps.setInfoPanel(null);
      return;
    }
    if (deps.phase.kind !== 'chat') return;
    if (deps.focus === 'input' && deps.suggestions.length > 0) {
      if (key.upArrow) {
        deps.setSuggestionIdx((i) => (i - 1 + deps.suggestions.length) % deps.suggestions.length);
        return;
      }
      if (key.downArrow) {
        deps.setSuggestionIdx((i) => (i + 1) % deps.suggestions.length);
        return;
      }
      if (key.tab) {
        const pick = deps.suggestions[deps.suggestionIdx];
        if (pick) deps.setInput(pick.name);
        return;
      }
      if (key.escape) {
        deps.setSuggestionsDismissedFor(deps.input);
        return;
      }
    }
    if (deps.focus === 'input' && (key.upArrow || key.downArrow)) {
      const history = deps.messages
        .filter((m): m is { id: number; kind: 'user'; content: string } => m.kind === 'user')
        .map((m) => m.content);
      if (key.upArrow) {
        if (history.length === 0) return;
        if (historyIdxRef.current === null) {
          historyIdxRef.current = 0;
          draftRef.current = deps.input;
        } else if (historyIdxRef.current < history.length - 1) {
          historyIdxRef.current += 1;
        } else {
          return;
        }
        deps.setInput(history[history.length - 1 - historyIdxRef.current] ?? '');
        return;
      }
      if (historyIdxRef.current === null) {
        deps.setFocus('tools-bar');
        return;
      }
      if (historyIdxRef.current > 0) {
        historyIdxRef.current -= 1;
        deps.setInput(history[history.length - 1 - historyIdxRef.current] ?? '');
      } else {
        historyIdxRef.current = null;
        deps.setInput(draftRef.current);
        draftRef.current = '';
      }
      return;
    }
    if (deps.focus === 'tools-bar') {
      if (key.upArrow || key.escape) deps.setFocus('input');
      else if (key.return) deps.setFocus('tools-panel');
      return;
    }
    if (deps.focus === 'tools-panel' && key.escape) deps.setFocus('tools-bar');
  });

  useEffect(
    () => () => {
      if (warningTimer.current) clearTimeout(warningTimer.current);
    },
    [],
  );

  return {
    exitWarning,
    // Called by the submit handler on every fresh submission so arrow-key
    // history browsing starts over next time.
    resetHistoryCursor: () => {
      historyIdxRef.current = null;
      draftRef.current = '';
    },
  };
}
