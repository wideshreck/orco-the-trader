import { streamText, type ModelMessage } from 'ai';
import { resolveModel } from './providers.js';
import { getApiKey } from './auth.js';
import type { CatalogProvider, ModelRef } from './catalog.js';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export async function* streamChat(
  provider: CatalogProvider,
  ref: ModelRef,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const apiKey = getApiKey(provider.id, provider.env);
  const model = await resolveModel({
    providerId: ref.providerId,
    modelId: ref.modelId,
    apiKey,
  });

  const modelMessages: ModelMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const result = streamText({
    model,
    messages: modelMessages,
    abortSignal: signal,
  });

  for await (const chunk of result.textStream) {
    yield chunk;
  }
}
