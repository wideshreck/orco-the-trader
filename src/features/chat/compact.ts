import { generateText, type ModelMessage } from 'ai';
import { getApiKey } from '../models/auth.js';
import type { CatalogProvider, ModelRef } from '../models/catalog.js';
import { resolveModel } from '../models/providers.js';
import { chatRowsToModelMessages } from '../sessions/index.js';
import type { ChatRow } from './use-chat.js';

const SUMMARIZE_SYSTEM = `You are a conversation compactor. Produce a dense, accurate summary of the prior conversation between a user and an assistant. Preserve:
- user's goals and open questions
- key decisions and code/data produced
- tool call results that matter for future turns
- constraints and preferences the user stated

Write in third person. No preamble. No bullet list unless the original was structured. Target 200-400 words.`;

export async function summarizeRows(
  rows: ChatRow[],
  provider: CatalogProvider,
  ref: ModelRef,
  signal?: AbortSignal,
): Promise<string> {
  if (rows.length === 0) return '';
  const apiKey = getApiKey(provider.id, provider.env);
  const model = await resolveModel({
    providerId: ref.providerId,
    modelId: ref.modelId,
    ...(apiKey !== undefined ? { apiKey } : {}),
  });
  const asMessages: ModelMessage[] = chatRowsToModelMessages(rows);
  const result = await generateText({
    model,
    system: SUMMARIZE_SYSTEM,
    messages: asMessages,
    ...(signal ? { abortSignal: signal } : {}),
  });
  return result.text.trim();
}
