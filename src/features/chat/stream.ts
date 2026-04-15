import { stepCountIs, streamText } from 'ai';
import { logger } from '../../shared/logging/logger.js';
import { getMcpTools } from '../mcp/index.js';
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
  system?: string;
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
  const nativeTools = buildAiSdkTools({ approver: opts.approver, signal: opts.signal });
  const mcpTools = getMcpTools(opts.approver);
  const tools = { ...nativeTools, ...mcpTools };
  logger.debug('stream', 'starting', {
    provider: ref.providerId,
    model: ref.modelId,
    messages: modelMessages.length,
    tools: Object.keys(tools).length,
  });

  const result = streamText({
    model,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(20),
    ...(opts.system ? { system: opts.system } : {}),
    ...(opts.signal ? { abortSignal: opts.signal } : {}),
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        yield { type: 'text-delta', delta: part.text };
        break;
      case 'tool-call':
        logger.info('stream', 'tool-call', { name: part.toolName, id: part.toolCallId });
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
        logger.warn('stream', 'tool-error', {
          name: part.toolName,
          error: errorString(part.error),
        });
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
