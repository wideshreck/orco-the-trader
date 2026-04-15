import type { ZodType } from 'zod';

export type Permission = 'auto' | 'ask' | 'deny';

export type ToolContext = {
  toolCallId: string;
  abortSignal: AbortSignal;
};

export type OrcoTool<I = unknown, O = unknown> = {
  name: string;
  description: string;
  permission: Permission;
  inputSchema: ZodType<I>;
  execute: (input: I, ctx: ToolContext) => Promise<O>;
};

export type ApprovalRequest = {
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type ApprovalDecision = 'allow' | 'deny' | 'always';

export type StreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
  | { type: 'tool-error'; toolCallId: string; toolName: string; error: string }
  | { type: 'approval-request'; toolCallId: string; toolName: string; input: unknown };

export type Approver = (req: ApprovalRequest) => Promise<ApprovalDecision>;
