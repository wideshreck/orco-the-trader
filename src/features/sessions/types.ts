export const SCHEMA_VERSION = 1;

export type SessionId = string;

export type SessionEvent =
  | { t: 'meta'; ts: number; v: number; sessionId: SessionId; createdAt: number }
  | { t: 'model'; ts: number; providerId: string; modelId: string }
  | { t: 'user'; ts: number; id: number; content: string }
  | { t: 'assistant'; ts: number; id: number; content: string; error?: boolean }
  | {
      t: 'tool';
      ts: number;
      id: number;
      toolCallId: string;
      name: string;
      input: unknown;
      output?: unknown;
      error?: string;
      status: 'pending' | 'awaiting-approval' | 'done' | 'error' | 'denied';
    };

export type SessionMeta = {
  id: SessionId;
  title: string;
  createdAt: number;
  lastModified: number;
  messageCount: number;
};

export type SessionIndex = {
  v: number;
  sessions: SessionMeta[];
};

export const MAX_INDEX_ENTRIES = 200;
export const TITLE_MAX_LEN = 50;
