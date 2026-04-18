import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const measurements = sqliteTable('measurements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
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
    timestamp: integer('timestamp', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    kind: text('kind', {
      enum: [
        'download_below',
        'upload_below',
        'latency_above',
        'bufferbloat_above',
        'failure_streak',
      ],
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
export type AlertKind =
  | 'download_below'
  | 'upload_below'
  | 'latency_above'
  | 'bufferbloat_above'
  | 'failure_streak';
export type AlertEvent = 'fired' | 'resolved';

export const users = sqliteTable('users', {
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
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = 'admin' | 'viewer';
export type UserProvider = 'local' | 'oidc';
