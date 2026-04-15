import { type ModelMessage, stepCountIs, streamText } from 'ai';
import { getApiKey } from './auth.js';
import type { CatalogProvider, ModelRef } from './catalog.js';
import { resolveModel } from './providers.js';
import type { Approver, StreamEvent } from './tools/index.js';
import { bootstrapTools, buildAiSdkTools } from './tools/index.js';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type StreamOptions = {
  signal?: AbortSignal;
  approver: Approver;
};

bootstrapTools();

export async function* streamChat(
  provider: CatalogProvider,
  ref: ModelRef,
  messages: ChatMessage[],
  opts: StreamOptions,
): AsyncGenerator<StreamEvent, void, void> {
  const apiKey = getApiKey(provider.id, provider.env);
  const model = await resolveModel({
    providerId: ref.providerId,
    modelId: ref.modelId,
    ...(apiKey !== undefined ? { apiKey } : {}),
  });

  const modelMessages: ModelMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const tools = buildAiSdkTools({ approver: opts.approver, signal: opts.signal });

  const result = streamText({
    model,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(20),
    ...(opts.signal ? { abortSignal: opts.signal } : {}),
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        yield { type: 'text-delta', delta: part.text };
        break;
      case 'tool-call':
        yield {
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        };
        break;
      case 'tool-result':
        yield {
          type: 'tool-result',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: part.output,
        };
        break;
      case 'tool-error':
        yield {
          type: 'tool-error',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          error: errorString(part.error),
        };
        break;
      // text-start, text-end, reasoning, finish, start-step, finish-step, etc — ignored
    }
  }
}

function errorString(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
