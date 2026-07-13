CREATE TABLE `employee_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_accounts_normalized_name_unique` ON `employee_accounts` (`normalized_name`);--> statement-breakpoint
ALTER TABLE `agent_sessions` ADD `account_id` text;--> statement-breakpoint
ALTER TABLE `agent_sessions` ADD `auth_token_hash` text;