import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { defineTool } from './define.js';

describe('defineTool', () => {
  it('creates a tool with the declared fields', () => {
    const tool = defineTool({
      name: 'echo',
      description: 'echoes input',
      permission: 'auto',
      inputSchema: z.object({ text: z.string() }),
      execute: async (input) => ({ echo: input.text }),
    });
    expect(tool.name).toBe('echo');
    expect(tool.description).toBe('echoes input');
    expect(tool.permission).toBe('auto');
  });

  it("defaults permission to 'ask' when omitted", () => {
    const tool = defineTool({
      name: 'dangerous',
      description: 'does a thing',
      inputSchema: z.object({}),
      execute: async () => ({}),
    });
    expect(tool.permission).toBe('ask');
  });

  it('rejects names with uppercase letters', () => {
    expect(() =>
      defineTool({
        name: 'BadName',
        description: '',
        inputSchema: z.object({}),
        execute: async () => ({}),
      }),
    ).toThrow(/tool name must match/);
  });

  it('rejects names starting with a digit', () => {
    expect(() =>
      defineTool({
        name: '1bad',
        description: '',
        inputSchema: z.object({}),
        execute: async () => ({}),
      }),
    ).toThrow();
  });

  it('rejects names with hyphens', () => {
    expect(() =>
      defineTool({
        name: 'bad-name',
        description: '',
        inputSchema: z.object({}),
        execute: async () => ({}),
      }),
    ).toThrow();
  });

  it('accepts snake_case names', () => {
    expect(() =>
      defineTool({
        name: 'get_time',
        description: '',
        inputSchema: z.object({}),
        execute: async () => ({}),
      }),
    ).not.toThrow();
  });
});
