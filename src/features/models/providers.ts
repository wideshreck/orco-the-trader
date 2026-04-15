import type { LanguageModel } from 'ai';

export const PROVIDER_IDS = [
  'anthropic',
  'openai',
  'google',
  'openrouter',
  'groq',
  'xai',
  'ollama',
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export class UnsupportedProviderError extends Error {
  readonly providerId: string;
  constructor(providerId: string) {
    super(`Unsupported provider: ${providerId}`);
    this.name = 'UnsupportedProviderError';
    this.providerId = providerId;
  }
}

type FactoryOpts = { apiKey?: string; baseURL?: string };
type ProviderFactory = (opts: FactoryOpts) => (modelId: string) => LanguageModel;

const FACTORIES: Record<ProviderId, () => Promise<ProviderFactory>> = {
  anthropic: async () => {
    const { createAnthropic } = await import('@ai-sdk/anthropic');
    return ({ apiKey }) => createAnthropic(apiKey ? { apiKey } : {});
  },
  openai: async () => {
    const { createOpenAI } = await import('@ai-sdk/openai');
    return ({ apiKey }) => createOpenAI(apiKey ? { apiKey } : {});
  },
  google: async () => {
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
    return ({ apiKey }) => createGoogleGenerativeAI(apiKey ? { apiKey } : {});
  },
  openrouter: async () => {
    const { createOpenRouter } = await import('@openrouter/ai-sdk-provider');
    return ({ apiKey }) => {
      const p = createOpenRouter(apiKey ? { apiKey } : {});
      return (id: string) => p.chat(id);
    };
  },
  groq: async () => {
    const { createGroq } = await import('@ai-sdk/groq');
    return ({ apiKey }) => createGroq(apiKey ? { apiKey } : {});
  },
  xai: async () => {
    const { createXai } = await import('@ai-sdk/xai');
    return ({ apiKey }) => createXai(apiKey ? { apiKey } : {});
  },
  ollama: async () => {
    const { createOllama } = await import('ollama-ai-provider-v2');
    return ({ baseURL }) => createOllama({ baseURL: baseURL ?? 'http://localhost:11434/api' });
  },
};

export function isSupportedProvider(id: string): id is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(id);
}

export function supportedProviderIds(): readonly ProviderId[] {
  return PROVIDER_IDS;
}

export async function resolveModel(opts: {
  providerId: string;
  modelId: string;
  apiKey?: string;
  baseURL?: string;
}): Promise<LanguageModel> {
  if (!isSupportedProvider(opts.providerId)) {
    throw new UnsupportedProviderError(opts.providerId);
  }
  const factory = await FACTORIES[opts.providerId]();
  const factoryOpts: FactoryOpts = {};
  if (opts.apiKey !== undefined) factoryOpts.apiKey = opts.apiKey;
  if (opts.baseURL !== undefined) factoryOpts.baseURL = opts.baseURL;
  const provider = factory(factoryOpts);
  return provider(opts.modelId);
}
