#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { render } from 'ink';
import { App } from './app.js';

const ENTER_ALT = '\x1b[?1049h\x1b[2J\x1b[H';
const LEAVE_ALT = '\x1b[?1049l';

let restored = false;
function restoreScreen(): void {
  if (restored) return;
  restored = true;
  try {
    process.stdout.write(LEAVE_ALT);
  } catch {
    // best-effort: stdout may already be closed
  }
}

function fatal(prefix: string, err: unknown): void {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  try {
    fs.writeSync(process.stderr.fd, `[orco] ${prefix}: ${msg}\n`);
  } catch {
    // stderr may also be closed; nothing to do
  }
}

if (!process.stdout.isTTY) {
  process.stderr.write('orco requires an interactive terminal (TTY).\n');
  process.exit(1);
}

process.stdout.write(ENTER_ALT);

process.on('exit', restoreScreen);

const SIGNAL_EXIT_CODES: Record<'SIGINT' | 'SIGTERM' | 'SIGHUP', number> = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
};

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => {
    restoreScreen();
    process.exit(SIGNAL_EXIT_CODES[sig]);
  });
}

process.on('uncaughtException', (err) => {
  restoreScreen();
  fatal('uncaught exception', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  restoreScreen();
  fatal('unhandled rejection', reason);
  process.exit(1);
});

const app = render(<App />, { exitOnCtrlC: false });

app.waitUntilExit().finally(restoreScreen);
