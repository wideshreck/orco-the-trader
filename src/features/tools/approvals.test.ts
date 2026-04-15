import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  forgetAlwaysAllowed,
  isAlwaysAllowed,
  listAlwaysAllowed,
  setAlwaysAllowed,
} from './approvals.js';

let tmpHome: string;
let spy: ReturnType<typeof spyOn> | null = null;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'orco-approvals-'));
  spy = spyOn(os, 'homedir').mockReturnValue(tmpHome);
});

afterEach(() => {
  spy?.mockRestore();
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe('approvals persistence', () => {
  it('returns false when the file does not exist', () => {
    expect(isAlwaysAllowed('anything')).toBe(false);
    expect(listAlwaysAllowed()).toEqual([]);
  });

  it('persists and reads back a setAlwaysAllowed entry', () => {
    setAlwaysAllowed('echo');
    expect(isAlwaysAllowed('echo')).toBe(true);
    expect(listAlwaysAllowed()).toEqual(['echo']);
  });

  it('creates the config directory if missing', () => {
    setAlwaysAllowed('x');
    const file = path.join(tmpHome, '.config', 'orco', 'approvals.json');
    expect(fs.existsSync(file)).toBe(true);
  });

  it('forget removes a previously-allowed tool', () => {
    setAlwaysAllowed('a');
    setAlwaysAllowed('b');
    forgetAlwaysAllowed('a');
    expect(isAlwaysAllowed('a')).toBe(false);
    expect(isAlwaysAllowed('b')).toBe(true);
    expect(listAlwaysAllowed()).toEqual(['b']);
  });

  it('falls back to empty state on corrupt JSON', () => {
    fs.mkdirSync(path.join(tmpHome, '.config', 'orco'), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, '.config', 'orco', 'approvals.json'), '{ not valid');
    expect(isAlwaysAllowed('x')).toBe(false);
    expect(listAlwaysAllowed()).toEqual([]);
  });

  it('ignores non-boolean entries when reading', () => {
    fs.mkdirSync(path.join(tmpHome, '.config', 'orco'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, '.config', 'orco', 'approvals.json'),
      JSON.stringify({ always: { real: true, fake: 'yes', other: 1 } }),
    );
    expect(listAlwaysAllowed()).toEqual(['real']);
  });
});
