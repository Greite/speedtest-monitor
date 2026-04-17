import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type Measurement = typeof measurements.$inferSelect;
export type NewMeasurement = typeof measurements.$inferInsert;
export type Setting = typeof settings.$inferSelect;
