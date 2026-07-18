CREATE TABLE `official_name_cache` (
	`nsk_id` integer PRIMARY KEY NOT NULL,
	`shikona_jp` text NOT NULL,
	`profile_url` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
