import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function configDir(): string {
  return path.join(os.homedir(), '.config', 'orco');
}

function configPath(): string {
  return path.join(configDir(), 'config.json');
}

export type Config = {
  providerId?: string;
  modelId?: string;
  systemPrompt?: string;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function loadConfig(): Config {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8')) as unknown;
    if (!isObject(raw)) return {};
    const cfg: Config = {};
    if (typeof raw.providerId === 'string') cfg.providerId = raw.providerId;
    if (typeof raw.modelId === 'string') cfg.modelId = raw.modelId;
    if (typeof raw.systemPrompt === 'string') cfg.systemPrompt = raw.systemPrompt;
    return cfg;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  fs.mkdirSync(configDir(), { recursive: true });
  const file = configPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, file);
}
