CREATE TABLE `rating_snapshot_staging` (
	`run_id` text NOT NULL,
	`wrestler_id` integer NOT NULL,
	`basho_id` integer NOT NULL,
	`division` integer NOT NULL,
	`elo` integer NOT NULL,
	`peak_elo` integer NOT NULL,
	`dohyo_score_tenths` integer NOT NULL,
	`bouts` integer NOT NULL,
	`wins` integer NOT NULL,
	`losses` integer NOT NULL,
	`glicko_rating` integer NOT NULL,
	`glicko_rd_tenths` integer NOT NULL,
	`glicko_volatility_millionths` integer NOT NULL,
	`sumo_hensachi_tenths` integer NOT NULL,
	`sekitori_hensachi_tenths` integer,
	PRIMARY KEY(`run_id`, `wrestler_id`),
	FOREIGN KEY (`run_id`) REFERENCES `rating_update_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wrestler_id`) REFERENCES `wrestlers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rating_snapshot_staging_run_idx` ON `rating_snapshot_staging` (`run_id`,`division`);--> statement-breakpoint
CREATE TABLE `rating_update_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rating_update_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`basho_id` integer NOT NULL,
	`official_basho_id` integer NOT NULL,
	`source_day` integer NOT NULL,
	`completed_day` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `rating_update_runs_basho_idx` ON `rating_update_runs` (`basho_id`,`started_at`);--> statement-breakpoint
ALTER TABLE `rating_snapshots` ADD `glicko_rating` integer;--> statement-breakpoint
ALTER TABLE `rating_snapshots` ADD `glicko_rd_tenths` integer;--> statement-breakpoint
ALTER TABLE `rating_snapshots` ADD `glicko_volatility_millionths` integer;--> statement-breakpoint
ALTER TABLE `rating_snapshots` ADD `sumo_hensachi_tenths` integer;--> statement-breakpoint
ALTER TABLE `rating_snapshots` ADD `sekitori_hensachi_tenths` integer;--> statement-breakpoint
ALTER TABLE `rating_snapshots` ADD `provisional` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rating_snapshots` ADD `updated_at` text DEFAULT '' NOT NULL;
