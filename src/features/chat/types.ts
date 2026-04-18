import type { TokenUsage } from '../tools/index.js';

export type UserRow = { id: number; kind: 'user'; content: string };
export type AssistantRow = {
  id: number;
  kind: 'assistant';
  content: string;
  error?: boolean;
  usage?: TokenUsage;
};
export type ToolRow = {
  id: number;
  kind: 'tool';
  toolCallId: string;
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
  status: 'pending' | 'awaiting-approval' | 'done' | 'error' | 'denied';
};
export type ChatRow = UserRow | AssistantRow | ToolRow;

export type SubmitOutcome = 'sent' | 'empty' | 'busy' | 'no-model';
export type CompactOutcome = 'compacted' | 'too-short' | 'no-model' | 'busy' | 'error';
