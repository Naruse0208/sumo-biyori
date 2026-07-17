CREATE TABLE `banzuke_entries` (
	`basho_id` integer NOT NULL,
	`division` integer NOT NULL,
	`wrestler_id` integer NOT NULL,
	`side` integer NOT NULL,
	`rank_code` text NOT NULL,
	`rank_number` integer,
	PRIMARY KEY(`basho_id`, `division`, `wrestler_id`),
	FOREIGN KEY (`basho_id`) REFERENCES `basho`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wrestler_id`) REFERENCES `wrestlers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `banzuke_basho_division_idx` ON `banzuke_entries` (`basho_id`,`division`,`rank_number`);--> statement-breakpoint
CREATE INDEX `banzuke_wrestler_idx` ON `banzuke_entries` (`wrestler_id`,`basho_id`);--> statement-breakpoint
CREATE TABLE `basho` (
	`id` integer PRIMARY KEY NOT NULL,
	`start_date` text,
	`end_date` text,
	`location` text,
	`source_url` text,
	`retrieved_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bouts` (
	`id` text PRIMARY KEY NOT NULL,
	`basho_id` integer NOT NULL,
	`division` integer NOT NULL,
	`day` integer NOT NULL,
	`match_no` integer NOT NULL,
	`east_wrestler_id` integer NOT NULL,
	`west_wrestler_id` integer NOT NULL,
	`winner_wrestler_id` integer,
	`east_rank` text,
	`west_rank` text,
	`kimarite` text,
	`east_elo_before` integer,
	`west_elo_before` integer,
	`east_elo_after` integer,
	`west_elo_after` integer,
	FOREIGN KEY (`basho_id`) REFERENCES `basho`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`east_wrestler_id`) REFERENCES `wrestlers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`west_wrestler_id`) REFERENCES `wrestlers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winner_wrestler_id`) REFERENCES `wrestlers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bouts_order_uq` ON `bouts` (`basho_id`,`division`,`day`,`match_no`);--> statement-breakpoint
CREATE INDEX `bouts_east_wrestler_idx` ON `bouts` (`east_wrestler_id`,`basho_id`,`day`);--> statement-breakpoint
CREATE INDEX `bouts_west_wrestler_idx` ON `bouts` (`west_wrestler_id`,`basho_id`,`day`);--> statement-breakpoint
CREATE TABLE `rating_snapshots` (
	`wrestler_id` integer NOT NULL,
	`basho_id` integer NOT NULL,
	`division` integer NOT NULL,
	`elo` integer NOT NULL,
	`peak_elo` integer NOT NULL,
	`dohyo_score_tenths` integer NOT NULL,
	`bouts` integer NOT NULL,
	`wins` integer NOT NULL,
	`losses` integer NOT NULL,
	PRIMARY KEY(`wrestler_id`, `basho_id`),
	FOREIGN KEY (`wrestler_id`) REFERENCES `wrestlers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`basho_id`) REFERENCES `basho`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rating_snapshots_leaderboard_idx` ON `rating_snapshots` (`basho_id`,`division`,`elo`);--> statement-breakpoint
CREATE INDEX `rating_snapshots_wrestler_idx` ON `rating_snapshots` (`wrestler_id`,`basho_id`);--> statement-breakpoint
CREATE TABLE `shikona_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wrestler_id` integer NOT NULL,
	`shikona_jp` text,
	`shikona_en` text NOT NULL,
	`start_basho_id` integer,
	`end_basho_id` integer,
	FOREIGN KEY (`wrestler_id`) REFERENCES `wrestlers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shikona_history_wrestler_idx` ON `shikona_history` (`wrestler_id`,`start_basho_id`);--> statement-breakpoint
CREATE TABLE `wrestlers` (
	`id` integer PRIMARY KEY NOT NULL,
	`sumodb_id` integer,
	`nsk_id` integer,
	`shikona_jp` text,
	`shikona_en` text NOT NULL,
	`heya` text,
	`birth_date` text,
	`shusshin` text,
	`height_mm` integer,
	`weight_kg` integer,
	`debut_basho_id` integer,
	`intai_date` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wrestlers_sumodb_id_uq` ON `wrestlers` (`sumodb_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wrestlers_nsk_id_uq` ON `wrestlers` (`nsk_id`);--> statement-breakpoint
CREATE INDEX `wrestlers_shikona_jp_idx` ON `wrestlers` (`shikona_jp`);