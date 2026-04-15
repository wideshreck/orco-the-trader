import { stepCountIs, streamText } from 'ai';
import { getApiKey } from '../models/auth.js';
import type { CatalogProvider, ModelRef } from '../models/catalog.js';
import { resolveModel } from '../models/providers.js';
import { chatRowsToModelMessages } from '../sessions/index.js';
import type { Approver, StreamEvent } from '../tools/index.js';
import { bootstrapTools, buildAiSdkTools } from '../tools/index.js';
import type { ChatRow } from './use-chat.js';

export type StreamOptions = {
  signal?: AbortSignal;
  approver: Approver;
};

bootstrapTools();

export async function* streamChat(
  provider: CatalogProvider,
  ref: ModelRef,
  rows: ChatRow[],
  opts: StreamOptions,
): AsyncGenerator<StreamEvent, void, void> {
  const apiKey = getApiKey(provider.id, provider.env);
  const model = await resolveModel({
    providerId: ref.providerId,
    modelId: ref.modelId,
    ...(apiKey !== undefined ? { apiKey } : {}),
  });

  const modelMessages = chatRowsToModelMessages(rows);
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
      case 'finish-step': {
        const u = part.usage;
        if (u && typeof u.inputTokens === 'number' && typeof u.outputTokens === 'number') {
          yield {
            type: 'usage',
            usage: { inputTokens: u.inputTokens, outputTokens: u.outputTokens },
          };
        }
        break;
      }
    }
  }
}

function errorString(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
