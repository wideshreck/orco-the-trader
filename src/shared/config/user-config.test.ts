import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, saveConfig } from './user-config.js';

let tmpHome: string;
let spy: ReturnType<typeof spyOn> | null = null;

function configFile(): string {
  return path.join(tmpHome, '.config', 'orco', 'config.json');
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'orco-config-'));
  spy = spyOn(os, 'homedir').mockReturnValue(tmpHome);
});

afterEach(() => {
  spy?.mockRestore();
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns an empty config when the file is absent', () => {
    expect(loadConfig()).toEqual({});
  });

  it('returns an empty config on corrupt JSON', () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), '{ not valid');
    expect(loadConfig()).toEqual({});
  });

  it('only copies string-typed fields', () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(
      configFile(),
      JSON.stringify({ providerId: 'a', modelId: 42, systemPrompt: null, extra: true }),
    );
    expect(loadConfig()).toEqual({ providerId: 'a' });
  });
});

describe('saveConfig', () => {
  it('persists and roundtrips a full config', () => {
    saveConfig({ providerId: 'anthropic', modelId: 'claude-x', systemPrompt: 'Be terse.' });
    expect(loadConfig()).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-x',
      systemPrompt: 'Be terse.',
    });
  });

  it('creates the config directory if missing', () => {
    saveConfig({ providerId: 'x', modelId: 'y' });
    expect(fs.existsSync(configFile())).toBe(true);
  });
});
