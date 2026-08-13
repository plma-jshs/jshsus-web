ALTER TABLE `account_activation_codes` ADD `expires_at` datetime(3);--> statement-breakpoint
CREATE INDEX `account_activation_expires_idx` ON `account_activation_codes` (`expires_at`);