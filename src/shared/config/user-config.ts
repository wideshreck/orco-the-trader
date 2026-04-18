import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function configDir(): string {
  return path.join(os.homedir(), '.config', 'orco');
}

function configPath(): string {
  return path.join(configDir(), 'config.json');
}

export type McpServerConfig =
  | { type: 'http'; url: string; headers?: Record<string, string> }
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> };

export type ToolPermission = 'auto' | 'ask' | 'deny';

export type Config = {
  providerId?: string;
  modelId?: string;
  systemPrompt?: string;
  mcpServers?: Record<string, McpServerConfig>;
  toolOverrides?: Record<string, ToolPermission>;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseStringRecord(raw: unknown): Record<string, string> | null {
  if (!isObject(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function parseMcpServer(raw: unknown): McpServerConfig | null {
  if (!isObject(raw)) return null;
  if (raw.type === 'http' && typeof raw.url === 'string') {
    const cfg: McpServerConfig = { type: 'http', url: raw.url };
    const headers = parseStringRecord(raw.headers);
    if (headers) cfg.headers = headers;
    return cfg;
  }
  if (raw.type === 'stdio' && typeof raw.command === 'string') {
    const cfg: McpServerConfig = { type: 'stdio', command: raw.command };
    if (Array.isArray(raw.args)) {
      const args = raw.args.filter((a): a is string => typeof a === 'string');
      if (args.length > 0) cfg.args = args;
    }
    const env = parseStringRecord(raw.env);
    if (env) cfg.env = env;
    return cfg;
  }
  return null;
}

export function loadConfig(): Config {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8')) as unknown;
    if (!isObject(raw)) return {};
    const cfg: Config = {};
    if (typeof raw.providerId === 'string') cfg.providerId = raw.providerId;
    if (typeof raw.modelId === 'string') cfg.modelId = raw.modelId;
    if (typeof raw.systemPrompt === 'string') cfg.systemPrompt = raw.systemPrompt;
    if (isObject(raw.mcpServers)) {
      const servers: Record<string, McpServerConfig> = {};
      for (const [name, entry] of Object.entries(raw.mcpServers)) {
        const parsed = parseMcpServer(entry);
        if (parsed) servers[name] = parsed;
      }
      if (Object.keys(servers).length > 0) cfg.mcpServers = servers;
    }
    if (isObject(raw.toolOverrides)) {
      const overrides: Record<string, ToolPermission> = {};
      for (const [name, value] of Object.entries(raw.toolOverrides)) {
        if (value === 'auto' || value === 'ask' || value === 'deny') {
          overrides[name] = value;
        }
      }
      if (Object.keys(overrides).length > 0) cfg.toolOverrides = overrides;
    }
    return cfg;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  const file = configPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
