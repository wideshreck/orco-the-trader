#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { render } from 'ink';
import { App } from '../app/app.js';
import { printBannerToStdout } from '../shared/ui/banner.js';

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

printBannerToStdout();

const SIGNAL_EXIT_CODES: Record<'SIGINT' | 'SIGTERM' | 'SIGHUP', number> = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
};

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => {
    process.exit(SIGNAL_EXIT_CODES[sig]);
  });
}

process.on('uncaughtException', (err) => {
  fatal('uncaught exception', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  fatal('unhandled rejection', reason);
  process.exit(1);
});

const app = render(<App />, { exitOnCtrlC: false });

void app.waitUntilExit();
