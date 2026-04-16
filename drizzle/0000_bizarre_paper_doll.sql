CREATE TABLE `measurements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`download_mbps` real,
	`upload_mbps` real,
	`latency_unloaded_ms` real,
	`latency_loaded_ms` real,
	`buffer_bloat_ms` real,
	`status` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
