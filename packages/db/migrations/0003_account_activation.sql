CREATE TABLE IF NOT EXISTS `account_activation_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`identity_type` enum('student','staff') NOT NULL,
	`identity_number` int NOT NULL,
	`code_hash` varchar(128) NOT NULL,
	`attempt_count` int NOT NULL DEFAULT 0,
	`issued_by_id` int,
	`used_by_id` int,
	`used_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `account_activation_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_activation_identity_idx` UNIQUE(`identity_type`,`identity_number`)
);
--> statement-breakpoint
SET @account_activation_issuer_idx_sql = IF(
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'account_activation_codes' AND index_name = 'account_activation_issuer_idx') = 0,
	'CREATE INDEX `account_activation_issuer_idx` ON `account_activation_codes` (`issued_by_id`)',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE account_activation_issuer_idx_stmt FROM @account_activation_issuer_idx_sql;
--> statement-breakpoint
EXECUTE account_activation_issuer_idx_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE account_activation_issuer_idx_stmt;
--> statement-breakpoint
SET @account_activation_used_idx_sql = IF(
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'account_activation_codes' AND index_name = 'account_activation_used_idx') = 0,
	'CREATE INDEX `account_activation_used_idx` ON `account_activation_codes` (`used_at`)',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE account_activation_used_idx_stmt FROM @account_activation_used_idx_sql;
--> statement-breakpoint
EXECUTE account_activation_used_idx_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE account_activation_used_idx_stmt;
--> statement-breakpoint
SET @account_activation_issued_by_fk_sql = IF(
	(SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'account_activation_codes' AND constraint_name = 'account_activation_issued_by_id_users_id_fk') = 0,
	'ALTER TABLE `account_activation_codes` ADD CONSTRAINT `account_activation_issued_by_id_users_id_fk` FOREIGN KEY (`issued_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE account_activation_issued_by_fk_stmt FROM @account_activation_issued_by_fk_sql;
--> statement-breakpoint
EXECUTE account_activation_issued_by_fk_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE account_activation_issued_by_fk_stmt;
--> statement-breakpoint
SET @account_activation_used_by_fk_sql = IF(
	(SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'account_activation_codes' AND constraint_name = 'account_activation_used_by_id_users_id_fk') = 0,
	'ALTER TABLE `account_activation_codes` ADD CONSTRAINT `account_activation_used_by_id_users_id_fk` FOREIGN KEY (`used_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE account_activation_used_by_fk_stmt FROM @account_activation_used_by_fk_sql;
--> statement-breakpoint
EXECUTE account_activation_used_by_fk_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE account_activation_used_by_fk_stmt;
--> statement-breakpoint
-- codex-contract-cleanup-approved: legacy IAM identifiers were replaced by users.id and auth_accounts provider links before this release.
SET @drop_users_legacy_iam_id_sql = IF(
	(SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'legacy_iam_id') = 1,
	'ALTER TABLE `users` DROP COLUMN `legacy_iam_id`',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE drop_users_legacy_iam_id_stmt FROM @drop_users_legacy_iam_id_sql;
--> statement-breakpoint
EXECUTE drop_users_legacy_iam_id_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE drop_users_legacy_iam_id_stmt;
--> statement-breakpoint
-- codex-contract-cleanup-approved: legacy JSHSUS identifiers were replaced by users.id and auth_accounts provider links before this release.
SET @drop_users_legacy_jshsus_id_sql = IF(
	(SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'legacy_jshsus_id') = 1,
	'ALTER TABLE `users` DROP COLUMN `legacy_jshsus_id`',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE drop_users_legacy_jshsus_id_stmt FROM @drop_users_legacy_jshsus_id_sql;
--> statement-breakpoint
EXECUTE drop_users_legacy_jshsus_id_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE drop_users_legacy_jshsus_id_stmt;
