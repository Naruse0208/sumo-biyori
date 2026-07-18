CREATE TABLE `live_sumo_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`payload` text,
	`updated_at_ms` integer DEFAULT 0 NOT NULL,
	`lease_until_ms` integer DEFAULT 0 NOT NULL,
	`lease_token` text
);
