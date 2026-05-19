import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const measurements = sqliteTable('measurements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  downloadMbps: real('download_mbps'),
  uploadMbps: real('upload_mbps'),
  latencyUnloadedMs: real('latency_unloaded_ms'),
  latencyLoadedMs: real('latency_loaded_ms'),
  bufferBloatMs: real('buffer_bloat_ms'),
  status: text('status', { enum: ['success', 'error', 'timeout'] }).notNull(),
  error: text('error'),
  serverLocations: text('server_locations', { mode: 'json' }).$type<string[]>(),
  userLocation: text('user_location'),
  userIp: text('user_ip'),
  jitterMs: real('jitter_ms'),
  packetLossPct: real('packet_loss_pct'),
  userIsp: text('user_isp'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type Measurement = typeof measurements.$inferSelect;
export type NewMeasurement = typeof measurements.$inferInsert;
export type Setting = typeof settings.$inferSelect;

export const alerts = sqliteTable(
  'alerts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
    kind: text('kind', {
      enum: ['download_below', 'upload_below', 'latency_above', 'bufferbloat_above', 'failure_streak'],
    }).notNull(),
    event: text('event', { enum: ['fired', 'resolved'] }).notNull(),
    measurementId: integer('measurement_id').references(() => measurements.id, {
      onDelete: 'set null',
    }),
    threshold: real('threshold'),
    observed: real('observed'),
    deliveryStatus: text('delivery_status', { mode: 'json' }).$type<
      Record<string, { ok: boolean; error?: string; httpStatus?: number }>
    >(),
  },
  (t) => ({
    kindTimestampIdx: index('alerts_kind_timestamp_idx').on(t.kind, t.timestamp),
  }),
);

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type AlertKind = 'download_below' | 'upload_below' | 'latency_above' | 'bufferbloat_above' | 'failure_streak';
export type AlertEvent = 'fired' | 'resolved';

// Legacy table from the next-auth era. Kept around so the
// migrate-auth-data script can backfill the Better Auth tables on the first
// boot after upgrading. Drop in a follow-up release once migration has run.
export const legacyUsers = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  role: text('role', { enum: ['admin', 'viewer'] })
    .notNull()
    .default('viewer'),
  provider: text('provider', { enum: ['local', 'oidc'] })
    .notNull()
    .default('local'),
  oidcSubject: text('oidc_subject').unique(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
});

export type LegacyUser = typeof legacyUsers.$inferSelect;
export type UserRole = 'admin' | 'viewer';
export type UserProvider = 'local' | 'oidc';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  role: text('role', { enum: ['admin', 'viewer'] })
    .notNull()
    .default('viewer'),
  provider: text('provider', { enum: ['local', 'oidc'] })
    .notNull()
    .default('local'),
  oidcSubject: text('oidc_subject').unique(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`),
});

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
