ALTER TABLE `banzuke_entries` RENAME COLUMN "rank_code" TO "rank";--> statement-breakpoint
ALTER TABLE `banzuke_entries` RENAME COLUMN "rank_number" TO "rank_value";--> statement-breakpoint
CREATE TABLE `rating_import_batches` (
	`batch_id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_count` integer NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DROP INDEX `banzuke_basho_division_idx`;--> statement-breakpoint
CREATE INDEX `banzuke_basho_division_idx` ON `banzuke_entries` (`basho_id`,`division`,`rank_value`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bouts` (
	`id` text PRIMARY KEY NOT NULL,
	`basho_id` integer NOT NULL,
	`division` integer NOT NULL,
	`day` integer NOT NULL,
	`wrestler_a_id` integer NOT NULL,
	`wrestler_b_id` integer NOT NULL,
	`winner_wrestler_id` integer,
	`kimarite` text,
	`wrestler_a_elo_before` integer,
	`wrestler_b_elo_before` integer,
	`wrestler_a_elo_after` integer,
	`wrestler_b_elo_after` integer,
	FOREIGN KEY (`basho_id`) REFERENCES `basho`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wrestler_a_id`) REFERENCES `wrestlers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wrestler_b_id`) REFERENCES `wrestlers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winner_wrestler_id`) REFERENCES `wrestlers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_bouts`("id", "basho_id", "division", "day", "wrestler_a_id", "wrestler_b_id", "winner_wrestler_id", "kimarite", "wrestler_a_elo_before", "wrestler_b_elo_before", "wrestler_a_elo_after", "wrestler_b_elo_after") SELECT "id", "basho_id", "division", "day", "east_wrestler_id", "west_wrestler_id", "winner_wrestler_id", "kimarite", "east_elo_before", "west_elo_before", "east_elo_after", "west_elo_after" FROM `bouts`;--> statement-breakpoint
DROP TABLE `bouts`;--> statement-breakpoint
ALTER TABLE `__new_bouts` RENAME TO `bouts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `bouts_order_idx` ON `bouts` (`basho_id`,`day`,`division`);--> statement-breakpoint
CREATE INDEX `bouts_wrestler_a_idx` ON `bouts` (`wrestler_a_id`,`basho_id`,`day`);--> statement-breakpoint
CREATE INDEX `bouts_wrestler_b_idx` ON `bouts` (`wrestler_b_id`,`basho_id`,`day`);
