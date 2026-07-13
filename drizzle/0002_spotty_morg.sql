CREATE TABLE `agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`mode` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `conversations` ADD `session_id` text DEFAULT 'legacy' NOT NULL;