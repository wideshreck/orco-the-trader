import type { Asker, QuestionRequest } from './types.js';

// Module-level asker hook — set by the UI at render time, consumed by the
// `ask_user` builtin tool. Using a module singleton keeps the tool definition
// dependency-free: tools reach the current UI through this channel.
let currentAsker: Asker | null = null;

export function setQuestionAsker(asker: Asker | null): void {
  currentAsker = asker;
}

export async function askHumanUser(req: QuestionRequest): Promise<string> {
  if (!currentAsker) {
    throw new Error('ask_user is unavailable — no interactive UI is attached');
  }
  return currentAsker(req);
}
