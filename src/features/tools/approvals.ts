import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function approvalsDir(): string {
  return path.join(os.homedir(), '.config', 'orco');
}

function approvalsPath(): string {
  return path.join(approvalsDir(), 'approvals.json');
}

type Persisted = {
  always: Record<string, boolean>;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function read(): Persisted {
  try {
    const raw = JSON.parse(fs.readFileSync(approvalsPath(), 'utf8')) as unknown;
    if (!isObject(raw) || !isObject(raw.always)) return { always: {} };
    const always: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(raw.always)) {
      if (typeof v === 'boolean') always[k] = v;
    }
    return { always };
  } catch {
    return { always: {} };
  }
}

function write(data: Persisted): void {
  fs.mkdirSync(approvalsDir(), { recursive: true, mode: 0o700 });
  const file = approvalsPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function isAlwaysAllowed(toolName: string): boolean {
  return read().always[toolName] === true;
}

export function setAlwaysAllowed(toolName: string): void {
  const data = read();
  data.always[toolName] = true;
  write(data);
}

export function listAlwaysAllowed(): string[] {
  const data = read();
  return Object.keys(data.always).filter((k) => data.always[k] === true);
}

export function forgetAlwaysAllowed(toolName: string): void {
  const data = read();
  delete data.always[toolName];
  write(data);
}
