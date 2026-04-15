#!/usr/bin/env node
import { render } from 'ink';
import { App } from './app.js';

process.stdout.write('\x1b[?1049h\x1b[2J\x1b[H');

const app = render(<App />, { exitOnCtrlC: false });

app.waitUntilExit().finally(() => {
  process.stdout.write('\x1b[?1049l');
});
