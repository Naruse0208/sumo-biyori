CREATE TABLE `prediction_records` (
	`id` text PRIMARY KEY NOT NULL,
	`basho_id` integer NOT NULL,
	`day` integer NOT NULL,
	`division` integer NOT NULL,
	`east_nsk_id` integer NOT NULL,
	`west_nsk_id` integer NOT NULL,
	`model_version` text NOT NULL,
	`elo_east_bp` integer NOT NULL,
	`glicko_east_bp` integer NOT NULL,
	`dohyo_v2_east_bp` integer NOT NULL,
	`dohyo_v3_east_bp` integer,
	`winner_nsk_id` integer,
	`predicted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `prediction_records_basho_idx` ON `prediction_records` (`basho_id`,`day`,`division`);--> statement-breakpoint
CREATE INDEX `prediction_records_unresolved_idx` ON `prediction_records` (`winner_nsk_id`,`basho_id`);