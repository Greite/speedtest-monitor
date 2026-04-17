import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, verifyPassword } from './hash';

describe('auth/hash', () => {
  it('hashPassword returns a non-empty argon2id-looking string', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(h).toMatch(/^\$argon2id\$/);
  });

  it('verifyPassword true for correct password', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(h, 'correct horse battery staple')).toBe(true);
  });

  it('verifyPassword false for wrong password', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(h, 'wrong password')).toBe(false);
  });

  it('verifyPassword false on malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });

  it('needsRehash false for a fresh hash', async () => {
    const h = await hashPassword('x');
    expect(needsRehash(h)).toBe(false);
  });
});
