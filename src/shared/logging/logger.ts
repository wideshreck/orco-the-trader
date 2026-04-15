import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB; truncate when exceeded

function logDir(): string {
  return path.join(os.homedir(), '.cache', 'orco');
}

function logFile(): string {
  return path.join(logDir(), 'debug.log');
}

function currentLevel(): LogLevel | null {
  const raw = process.env.ORCO_LOG;
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === 'off' || v === '0' || v === 'false') return null;
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error') return v;
  // ORCO_LOG=1 or similar → default to debug
  return 'debug';
}

function shouldLog(level: LogLevel): boolean {
  const min = currentLevel();
  if (!min) return false;
  return LEVEL_RANK[level] >= LEVEL_RANK[min];
}

function truncateIfLarge(): void {
  try {
    const stat = fs.statSync(logFile());
    if (stat.size > MAX_BYTES) fs.truncateSync(logFile(), 0);
  } catch {
    // ignore: file doesn't exist yet
  }
}

function safeStringify(value: unknown): string {
  if (value === undefined) return '';
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function log(level: LogLevel, scope: string, msg: string, meta?: unknown): void {
  if (!shouldLog(level)) return;
  try {
    fs.mkdirSync(logDir(), { recursive: true });
    truncateIfLarge();
    const ts = new Date().toISOString();
    const metaStr = meta === undefined ? '' : ` ${safeStringify(meta)}`;
    const line = `${ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${metaStr}\n`;
    fs.appendFileSync(logFile(), line);
  } catch {
    // swallow — logging must never crash the app
  }
}

export const logger = {
  debug: (scope: string, msg: string, meta?: unknown) => log('debug', scope, msg, meta),
  info: (scope: string, msg: string, meta?: unknown) => log('info', scope, msg, meta),
  warn: (scope: string, msg: string, meta?: unknown) => log('warn', scope, msg, meta),
  error: (scope: string, msg: string, meta?: unknown) => log('error', scope, msg, meta),
};

export function logFilePath(): string {
  return logFile();
}

export function isLoggingEnabled(): boolean {
  return currentLevel() !== null;
}
