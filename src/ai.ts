import { type ModelMessage, streamText } from 'ai';
import { getApiKey } from './auth.js';
import type { CatalogProvider, ModelRef } from './catalog.js';
import { resolveModel } from './providers.js';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export async function* streamChat(
  provider: CatalogProvider,
  ref: ModelRef,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
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

  const result = streamText({
    model,
    messages: modelMessages,
    ...(signal ? { abortSignal: signal } : {}),
  });

  for await (const chunk of result.textStream) {
    yield chunk;
  }
}
