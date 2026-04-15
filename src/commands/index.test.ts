import { describe, expect, it } from 'bun:test';
import { isKnownCommand, matchCommands, SLASH_COMMANDS } from './index.js';

describe('matchCommands', () => {
  it('returns empty array when input does not start with /', () => {
    expect(matchCommands('hello')).toEqual([]);
    expect(matchCommands('')).toEqual([]);
  });

  it('returns all commands when input is just /', () => {
    const result = matchCommands('/');
    expect(result).toHaveLength(SLASH_COMMANDS.length);
  });

  it('returns prefix matches', () => {
    const result = matchCommands('/co');
    const names = result.map((c) => c.name);
    expect(names).toContain('/compact');
    expect(names).toContain('/cost');
    expect(names).not.toContain('/help');
  });

  it('is case insensitive', () => {
    const lower = matchCommands('/he').map((c) => c.name);
    const upper = matchCommands('/HE').map((c) => c.name);
    expect(lower).toEqual(upper);
  });

  it('hides dropdown when input exactly matches a unique command', () => {
    expect(matchCommands('/help')).toEqual([]);
  });

  it('returns single match when prefix is unambiguous', () => {
    const result = matchCommands('/hel');
    expect(result.map((c) => c.name)).toEqual(['/help']);
  });
});

describe('isKnownCommand', () => {
  it('returns true for registered commands', () => {
    expect(isKnownCommand('/help')).toBe(true);
    expect(isKnownCommand('/compact')).toBe(true);
  });

  it('returns false for unknown commands', () => {
    expect(isKnownCommand('/nosuch')).toBe(false);
    expect(isKnownCommand('/')).toBe(false);
  });

  it('is exact match, not prefix', () => {
    expect(isKnownCommand('/he')).toBe(false);
  });
});

describe('SLASH_COMMANDS', () => {
  it('is sorted alphabetically', () => {
    const names = SLASH_COMMANDS.map((c) => c.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});
