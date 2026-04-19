import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { loadAuthConfig } from './config';

const KEYS = [
  'AUTH_SECRET',
  'SPEEDTEST_OIDC_ISSUER',
  'SPEEDTEST_OIDC_CLIENT_ID',
  'SPEEDTEST_OIDC_CLIENT_SECRET',
  'SPEEDTEST_OIDC_DISPLAY_NAME',
  'SPEEDTEST_OIDC_ADMIN_EMAIL',
  'SPEEDTEST_OIDC_ALLOW_NEW_USERS',
  'SPEEDTEST_ADMIN_EMAIL',
  'SPEEDTEST_ADMIN_PASSWORD',
];

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe('auth/config', () => {
  it('returns oidc=null + seed=null when nothing is set', () => {
    process.env.AUTH_SECRET = 's';
    const c = loadAuthConfig();
    expect(c.oidc).toBeNull();
    expect(c.seed).toBeNull();
    expect(c.secret).toBe('s');
  });

  it('parses full OIDC', () => {
    process.env.AUTH_SECRET = 's';
    process.env.SPEEDTEST_OIDC_ISSUER = 'https://idp';
    process.env.SPEEDTEST_OIDC_CLIENT_ID = 'cid';
    process.env.SPEEDTEST_OIDC_CLIENT_SECRET = 'csec';
    process.env.SPEEDTEST_OIDC_DISPLAY_NAME = 'Auth';
    process.env.SPEEDTEST_OIDC_ADMIN_EMAIL = 'me@x';
    process.env.SPEEDTEST_OIDC_ALLOW_NEW_USERS = 'false';
    expect(loadAuthConfig().oidc).toEqual({
      issuer: 'https://idp',
      clientId: 'cid',
      clientSecret: 'csec',
      displayName: 'Auth',
      adminEmail: 'me@x',
      allowNewUsers: false,
    });
  });

  it('disables OIDC silently when only some vars are set', () => {
    process.env.AUTH_SECRET = 's';
    process.env.SPEEDTEST_OIDC_ISSUER = 'https://idp';
    // client id/secret missing
    expect(loadAuthConfig().oidc).toBeNull();
  });

  it('parses seed admin', () => {
    process.env.AUTH_SECRET = 's';
    process.env.SPEEDTEST_ADMIN_EMAIL = 'A@B.c';
    process.env.SPEEDTEST_ADMIN_PASSWORD = 'hunter2hunter2';
    expect(loadAuthConfig().seed).toEqual({ email: 'a@b.c', password: 'hunter2hunter2' });
  });

  it('throws when AUTH_SECRET is missing', () => {
    expect(() => loadAuthConfig()).toThrow(/AUTH_SECRET/);
  });
});
