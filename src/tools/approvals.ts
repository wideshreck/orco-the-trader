import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APPROVALS_DIR = path.join(os.homedir(), '.config', 'orco');
const APPROVALS_PATH = path.join(APPROVALS_DIR, 'approvals.json');

type Persisted = {
  always: Record<string, boolean>;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function read(): Persisted {
  try {
    const raw = JSON.parse(fs.readFileSync(APPROVALS_PATH, 'utf8')) as unknown;
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
  fs.mkdirSync(APPROVALS_DIR, { recursive: true });
  const tmp = `${APPROVALS_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, APPROVALS_PATH);
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
