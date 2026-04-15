import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getAllAuth, getApiKey, getAuth, isAuthenticated, removeAuth, setAuth } from './auth.js';

let tmpHome: string;
let spy: ReturnType<typeof spyOn> | null = null;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'orco-auth-'));
  spy = spyOn(os, 'homedir').mockReturnValue(tmpHome);
  originalEnv = { ...process.env };
  // Clear any API key env so tests are deterministic
  for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'FAKE_KEY']) {
    delete process.env[key];
  }
});

afterEach(() => {
  spy?.mockRestore();
  fs.rmSync(tmpHome, { recursive: true, force: true });
  process.env = originalEnv;
});

describe('setAuth / getAuth', () => {
  it('roundtrips an api key entry', () => {
    setAuth('anthropic', { type: 'api', key: 'sk-test' });
    expect(getAuth('anthropic')).toEqual({ type: 'api', key: 'sk-test' });
  });

  it('roundtrips an oauth entry with optional fields', () => {
    setAuth('google', {
      type: 'oauth',
      access: 'at',
      refresh: 'rt',
      expiresAt: 123,
    });
    expect(getAuth('google')).toEqual({
      type: 'oauth',
      access: 'at',
      refresh: 'rt',
      expiresAt: 123,
    });
  });

  it('returns undefined for unknown provider', () => {
    expect(getAuth('ghost')).toBeUndefined();
  });

  it('removeAuth deletes the entry', () => {
    setAuth('x', { type: 'api', key: 'k' });
    removeAuth('x');
    expect(getAuth('x')).toBeUndefined();
  });

  it('drops malformed entries on read', () => {
    fs.mkdirSync(path.join(tmpHome, '.config', 'orco'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, '.config', 'orco', 'auth.json'),
      JSON.stringify({ good: { type: 'api', key: 'k' }, bad: { type: 'api' } }),
    );
    expect(Object.keys(getAllAuth())).toEqual(['good']);
  });
});

describe('getApiKey', () => {
  it('prefers the environment variable over stored auth', () => {
    process.env.FAKE_KEY = 'env-value';
    setAuth('p', { type: 'api', key: 'disk-value' });
    expect(getApiKey('p', ['FAKE_KEY'])).toBe('env-value');
  });

  it('falls back to stored auth when env is unset', () => {
    setAuth('p', { type: 'api', key: 'disk-value' });
    expect(getApiKey('p', ['FAKE_KEY'])).toBe('disk-value');
  });

  it('returns undefined with no env and no stored entry', () => {
    expect(getApiKey('p', ['FAKE_KEY'])).toBeUndefined();
  });

  it('returns undefined when stored entry is oauth, not api', () => {
    setAuth('p', { type: 'oauth', access: 'at' });
    expect(getApiKey('p', ['FAKE_KEY'])).toBeUndefined();
  });
});

describe('isAuthenticated', () => {
  it('is true when an API key is resolvable', () => {
    setAuth('p', { type: 'api', key: 'k' });
    expect(isAuthenticated('p', ['FAKE_KEY'])).toBe(true);
  });

  it('is false when nothing is available', () => {
    expect(isAuthenticated('p', ['FAKE_KEY'])).toBe(false);
  });
});
