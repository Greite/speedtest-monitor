import { describe, expect, it } from 'bun:test';
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

  it('verifies hashes produced by the previous @node-rs/argon2 impl', async () => {
    // Hash generated with @node-rs/argon2@2 (m=19456, t=2, p=1) for
    // "fastcom-phase3-check" before the Bun.password swap, to guard
    // against PHC compatibility regressions.
    const legacyHash =
      '$argon2id$v=19$m=19456,t=2,p=1$3c66F4wAv8w0ojbqwL6JfQ$uEHCcX9C8laTZo+8XBdG+2kSbU3jgkjnFLTw2MZ/9GY';
    expect(await verifyPassword(legacyHash, 'fastcom-phase3-check')).toBe(true);
    expect(await verifyPassword(legacyHash, 'wrong')).toBe(false);
    expect(needsRehash(legacyHash)).toBe(false);
  });
});
