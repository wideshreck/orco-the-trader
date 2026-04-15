import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function configDir(): string {
  return path.join(os.homedir(), '.config', 'orco');
}

function configPath(): string {
  return path.join(configDir(), 'config.json');
}

export type McpServerConfig = {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
};

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

function parseMcpServer(raw: unknown): McpServerConfig | null {
  if (!isObject(raw)) return null;
  if (raw.type !== 'http' || typeof raw.url !== 'string') return null;
  const cfg: McpServerConfig = { type: 'http', url: raw.url };
  if (isObject(raw.headers)) {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.headers)) {
      if (typeof v === 'string') headers[k] = v;
    }
    if (Object.keys(headers).length > 0) cfg.headers = headers;
  }
  return cfg;
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
  fs.mkdirSync(configDir(), { recursive: true });
  const file = configPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, file);
}
