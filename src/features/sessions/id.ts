import { randomBytes } from 'node:crypto';

const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford

function encodeTime(ms: number): string {
  let n = ms;
  let out = '';
  for (let i = 0; i < 12; i++) {
    out = BASE32[n & 31] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

export function newSessionId(): string {
  return `${encodeTime(Date.now())}-${randomBytes(3).toString('hex')}`;
}
