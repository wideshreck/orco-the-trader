import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const AUTH_DIR = path.join(os.homedir(), '.config', 'jarvis');
const AUTH_PATH = path.join(AUTH_DIR, 'auth.json');

export type ApiKeyAuth = { type: 'api'; key: string };
export type OAuthAuth = {
  type: 'oauth';
  access: string;
  refresh?: string;
  expiresAt?: number;
};
export type AuthEntry = ApiKeyAuth | OAuthAuth;
export type AuthStore = Record<string, AuthEntry>;

function readStore(): AuthStore {
  try {
    const raw = fs.readFileSync(AUTH_PATH, 'utf8');
    return JSON.parse(raw) as AuthStore;
  } catch {
    return {};
  }
}

function writeStore(store: AuthStore): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(AUTH_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
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
