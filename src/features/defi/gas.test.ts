import { describe, expect, it } from 'bun:test';
import { classifyGas, hexToNumber, hexWeiToGwei } from './gas.js';

describe('hexWeiToGwei', () => {
  it('converts 1 gwei (1e9 wei) to exactly 1 gwei', () => {
    // 1 gwei = 0x3b9aca00 wei
    expect(hexWeiToGwei('0x3b9aca00')).toBe(1);
  });

  it('converts 25.5 gwei (25.5e9 wei) preserving 4-decimal precision', () => {
    const wei = 25_500_000_000n;
    const hex = `0x${wei.toString(16)}`;
    expect(hexWeiToGwei(hex)).toBeCloseTo(25.5, 4);
  });

  it('handles multi-hundred gwei without float loss', () => {
    const wei = 345_678_900_000n;
    const hex = `0x${wei.toString(16)}`;
    expect(hexWeiToGwei(hex)).toBeCloseTo(345.6789, 4);
  });

  it('rejects non-hex input', () => {
    expect(hexWeiToGwei('25000000000')).toBeNull();
    expect(hexWeiToGwei(null)).toBeNull();
    expect(hexWeiToGwei(undefined)).toBeNull();
    expect(hexWeiToGwei(42 as unknown)).toBeNull();
  });

  it('rejects malformed hex', () => {
    expect(hexWeiToGwei('0xnotahex')).toBeNull();
  });
});

describe('hexToNumber', () => {
  it('parses block numbers', () => {
    expect(hexToNumber('0x1')).toBe(1);
    expect(hexToNumber('0x1234abcd')).toBe(305441741);
  });

  it('returns null for bad input', () => {
    expect(hexToNumber('not-hex')).toBeNull();
    expect(hexToNumber(null)).toBeNull();
  });
});

describe('classifyGas', () => {
  const ethBands = { quiet: 2, normal: 20, busy: 60 };

  it('classifies post-Pectra sub-gwei ETH as idle', () => {
    expect(classifyGas(0.15, ethBands)).toBe('idle');
    expect(classifyGas(0.4, ethBands)).toBe('idle');
  });

  it('classifies sub-2 gwei as quiet', () => {
    expect(classifyGas(1, ethBands)).toBe('quiet');
    expect(classifyGas(1.8, ethBands)).toBe('quiet');
  });

  it('classifies typical ETH gas as normal', () => {
    expect(classifyGas(5, ethBands)).toBe('normal');
    expect(classifyGas(15, ethBands)).toBe('normal');
  });

  it('classifies elevated gas as busy', () => {
    expect(classifyGas(25, ethBands)).toBe('busy');
    expect(classifyGas(55, ethBands)).toBe('busy');
  });

  it('classifies mania-level gas as congested', () => {
    expect(classifyGas(80, ethBands)).toBe('congested');
    expect(classifyGas(300, ethBands)).toBe('congested');
  });

  it('uses per-chain bands so L2 gwei is not called "idle" across the board', () => {
    const arbBands = { quiet: 0.05, normal: 0.2, busy: 0.8 };
    expect(classifyGas(0.15, arbBands)).toBe('normal'); // same 0.15 gwei
    expect(classifyGas(0.01, arbBands)).toBe('idle');
  });
});
