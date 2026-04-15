import type { LanguageModel } from 'ai';

type ProviderFactory = (opts: {
  apiKey?: string;
  baseURL?: string;
}) => (modelId: string) => LanguageModel;

const FACTORIES: Record<string, () => Promise<ProviderFactory>> = {
  anthropic: async () => {
    const { createAnthropic } = await import('@ai-sdk/anthropic');
    return ({ apiKey }) => createAnthropic({ apiKey });
  },
  openai: async () => {
    const { createOpenAI } = await import('@ai-sdk/openai');
    return ({ apiKey }) => createOpenAI({ apiKey });
  },
  google: async () => {
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
    return ({ apiKey }) => createGoogleGenerativeAI({ apiKey });
  },
  openrouter: async () => {
    const { createOpenRouter } = await import('@openrouter/ai-sdk-provider');
    return ({ apiKey }) => {
      const p = createOpenRouter({ apiKey });
      return (id: string) => p.chat(id);
    };
  },
  groq: async () => {
    const { createGroq } = await import('@ai-sdk/groq');
    return ({ apiKey }) => createGroq({ apiKey });
  },
  xai: async () => {
    const { createXai } = await import('@ai-sdk/xai');
    return ({ apiKey }) => createXai({ apiKey });
  },
  ollama: async () => {
    const { createOllama } = await import('ollama-ai-provider-v2');
    return ({ baseURL }) => createOllama({ baseURL: baseURL ?? 'http://localhost:11434/api' });
  },
};

export function isSupportedProvider(id: string): boolean {
  return id in FACTORIES;
}

export function supportedProviderIds(): string[] {
  return Object.keys(FACTORIES);
}

export async function resolveModel(opts: {
  providerId: string;
  modelId: string;
  apiKey?: string;
  baseURL?: string;
}): Promise<LanguageModel> {
  const loader = FACTORIES[opts.providerId];
  if (!loader) {
    throw new Error(`Unsupported provider: ${opts.providerId}`);
  }
  const factory = await loader();
  const provider = factory({ apiKey: opts.apiKey, baseURL: opts.baseURL });
  return provider(opts.modelId);
}
