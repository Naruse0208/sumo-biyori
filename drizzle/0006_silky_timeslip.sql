ALTER TABLE `bout_highlights` ADD `status` text DEFAULT 'generated' NOT NULL;--> statement-breakpoint
ALTER TABLE `bout_highlights` ADD `fallback_reason` text;