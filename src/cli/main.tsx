#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { render } from 'ink';
import { App } from '../app/app.js';
import { shutdownMcp } from '../features/mcp/index.js';
import { logger } from '../shared/logging/logger.js';
import { printBannerToStdout } from '../shared/ui/banner.js';
import { ErrorBoundary } from '../shared/ui/error-boundary.js';

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
    void shutdownMcp().finally(() => process.exit(SIGNAL_EXIT_CODES[sig]));
  });
}

process.on('uncaughtException', (err) => {
  logger.error('runtime', 'uncaughtException', {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  fatal('uncaught exception', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('runtime', 'unhandledRejection', { reason: String(reason) });
  fatal('unhandled rejection', reason);
  process.exit(1);
});

logger.info('runtime', 'orco starting');

const app = render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  { exitOnCtrlC: false },
);

void app.waitUntilExit().finally(() => {
  void shutdownMcp();
});
