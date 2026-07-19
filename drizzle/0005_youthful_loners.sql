CREATE TABLE `bout_highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`basho_id` integer NOT NULL,
	`day` integer NOT NULL,
	`division` integer NOT NULL,
	`east_nsk_id` integer NOT NULL,
	`west_nsk_id` integer NOT NULL,
	`facts_hash` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`schema_version` text NOT NULL,
	`payload` text NOT NULL,
	`generated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bout_highlights_match_uq` ON `bout_highlights` (`basho_id`,`day`,`division`,`east_nsk_id`,`west_nsk_id`);--> statement-breakpoint
CREATE INDEX `bout_highlights_day_idx` ON `bout_highlights` (`basho_id`,`day`,`division`);