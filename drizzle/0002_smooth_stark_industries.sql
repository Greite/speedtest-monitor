CREATE TABLE `alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`kind` text NOT NULL,
	`event` text NOT NULL,
	`measurement_id` integer,
	`threshold` real,
	`observed` real,
	`delivery_status` text,
	FOREIGN KEY (`measurement_id`) REFERENCES `measurements`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `alerts_kind_timestamp_idx` ON `alerts` (`kind`,`timestamp`);