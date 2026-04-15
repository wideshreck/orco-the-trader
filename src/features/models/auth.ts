import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function authDir(): string {
  return path.join(os.homedir(), '.config', 'orco');
}

function authPath(): string {
  return path.join(authDir(), 'auth.json');
}

export type ApiKeyAuth = { type: 'api'; key: string };
export type OAuthAuth = {
  type: 'oauth';
  access: string;
  refresh?: string;
  expiresAt?: number;
};
export type AuthEntry = ApiKeyAuth | OAuthAuth;
export type AuthStore = Record<string, AuthEntry>;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseEntry(raw: unknown): AuthEntry | null {
  if (!isObject(raw)) return null;
  if (raw.type === 'api' && typeof raw.key === 'string') {
    return { type: 'api', key: raw.key };
  }
  if (raw.type === 'oauth' && typeof raw.access === 'string') {
    const out: OAuthAuth = { type: 'oauth', access: raw.access };
    if (typeof raw.refresh === 'string') out.refresh = raw.refresh;
    if (typeof raw.expiresAt === 'number') out.expiresAt = raw.expiresAt;
    return out;
  }
  return null;
}

function readStore(): AuthStore {
  try {
    const raw = JSON.parse(fs.readFileSync(authPath(), 'utf8')) as unknown;
    if (!isObject(raw)) return {};
    const out: AuthStore = {};
    for (const [k, v] of Object.entries(raw)) {
      const entry = parseEntry(v);
      if (entry) out[k] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(store: AuthStore): void {
  fs.mkdirSync(authDir(), { recursive: true, mode: 0o700 });
  const file = authPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function setAuth(providerId: string, entry: AuthEntry): void {
  const store = readStore();
  store[providerId] = entry;
  writeStore(store);
}

export function removeAuth(providerId: string): void {
  const store = readStore();
  delete store[providerId];
  writeStore(store);
}

export function getAuth(providerId: string): AuthEntry | undefined {
  return readStore()[providerId];
}

export function getAllAuth(): AuthStore {
  return readStore();
}

export function getApiKey(providerId: string, envKeys: string[]): string | undefined {
  for (const env of envKeys) {
    const v = process.env[env];
    if (v) return v;
  }
  const entry = readStore()[providerId];
  if (entry?.type === 'api') return entry.key;
  return undefined;
}

export function isAuthenticated(providerId: string, envKeys: string[]): boolean {
  return Boolean(getApiKey(providerId, envKeys));
}
