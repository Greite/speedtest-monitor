import { describe, expect, it } from 'bun:test';

process.env.SPEEDTEST_DB_PATH = ':memory:';
process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret';

const { closeDb } = await import('../db/client');
const { runMigrations } = await import('../db/migrate');
const { auth } = await import('./handler');
const { hashPassword } = await import('./hash');
const { createUser, setCredentialPassword } = await import('./users');

describe('email/password sign-in', () => {
  it('signs in a user created through setCredentialPassword', async () => {
    closeDb(); // other test files leave a hand-built in-memory db behind
    runMigrations();
    const created = createUser({
      email: 'admin@example.com',
      name: '',
      emailVerified: true,
      role: 'admin',
      provider: 'local',
    });
    setCredentialPassword(created.id, await hashPassword('correct horse battery'));

    const res = await auth.api.signInEmail({ body: { email: 'admin@example.com', password: 'correct horse battery' } });
    expect(res.user.email).toBe('admin@example.com');
  });
});
