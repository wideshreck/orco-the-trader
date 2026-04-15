import { describe, expect, it } from 'bun:test';
import { errorMessage, isAbortError } from './index.js';

describe('isAbortError', () => {
  it('returns true for AbortError', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('returns true for AbortSignalError', () => {
    const err = new Error('signal');
    err.name = 'AbortSignalError';
    expect(isAbortError(err)).toBe(true);
  });

  it('returns false for other Error types', () => {
    expect(isAbortError(new Error('boom'))).toBe(false);
    expect(isAbortError(new TypeError('bad'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isAbortError('AbortError')).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError({ name: 'AbortError' })).toBe(false);
  });
});

describe('errorMessage', () => {
  it('extracts message from Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('passes through string values', () => {
    expect(errorMessage('literal')).toBe('literal');
  });

  it('stringifies other values', () => {
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage(null)).toBe('null');
    expect(errorMessage(undefined)).toBe('undefined');
    expect(errorMessage({ foo: 'bar' })).toBe('[object Object]');
  });
});
