import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { defineTool } from './define.js';
import {
  clearForTesting,
  effectivePermission,
  get,
  listActive,
  listAll,
  register,
  setPermissionOverrides,
} from './registry.js';

function makeTool(name: string, permission: 'auto' | 'ask' | 'deny' = 'auto') {
  return defineTool({
    name,
    description: `${name} tool`,
    permission,
    inputSchema: z.object({}),
    execute: async () => ({}),
  });
}

describe('registry', () => {
  beforeEach(() => {
    clearForTesting();
    setPermissionOverrides({});
  });

  afterEach(() => {
    setPermissionOverrides({});
  });

  it('starts empty', () => {
    expect(listAll()).toEqual([]);
    expect(listActive()).toEqual([]);
  });

  it('registers and lists tools', () => {
    register(makeTool('alpha'));
    register(makeTool('beta'));
    const names = listAll().map((t) => t.name);
    expect(names).toEqual(['alpha', 'beta']);
  });

  it('retrieves a tool by name via get()', () => {
    const a = makeTool('alpha');
    register(a);
    expect(get('alpha')?.name).toBe('alpha');
    expect(get('missing')).toBeUndefined();
  });

  it('rejects duplicate registration', () => {
    register(makeTool('dup'));
    expect(() => register(makeTool('dup'))).toThrow(/already registered/);
  });

  it('listActive hides tools whose permission is deny', () => {
    register(makeTool('on', 'auto'));
    register(makeTool('ask_me', 'ask'));
    register(makeTool('off', 'deny'));
    const activeNames = listActive().map((t) => t.name);
    expect(activeNames).toEqual(['on', 'ask_me']);
  });

  it('preserves insertion order', () => {
    register(makeTool('c'));
    register(makeTool('a'));
    register(makeTool('b'));
    expect(listAll().map((t) => t.name)).toEqual(['c', 'a', 'b']);
  });

  it('config overrides take precedence over declared permission', () => {
    const t = makeTool('risky', 'auto');
    register(t);
    expect(effectivePermission(t)).toBe('auto');
    setPermissionOverrides({ risky: 'deny' });
    expect(effectivePermission(t)).toBe('deny');
    expect(listActive()).toEqual([]);
  });

  it('override can upgrade a declared ask tool to auto', () => {
    const t = makeTool('ask_me', 'ask');
    register(t);
    setPermissionOverrides({ ask_me: 'auto' });
    expect(effectivePermission(t)).toBe('auto');
  });

  it('missing override falls through to the declared permission', () => {
    const t = makeTool('unchanged', 'ask');
    register(t);
    setPermissionOverrides({ somethingElse: 'deny' });
    expect(effectivePermission(t)).toBe('ask');
  });
});
