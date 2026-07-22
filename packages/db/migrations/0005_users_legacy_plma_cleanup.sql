-- codex-contract-cleanup-approved: legacy PLMA identifiers were fully replaced by users.id/auth_accounts links before this release.
SET @drop_users_legacy_plma_id_sql = IF(
	(SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'legacy_plma_id') = 1,
	'ALTER TABLE `users` DROP COLUMN `legacy_plma_id`',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE drop_users_legacy_plma_id_stmt FROM @drop_users_legacy_plma_id_sql;
--> statement-breakpoint
EXECUTE drop_users_legacy_plma_id_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE drop_users_legacy_plma_id_stmt;
--> statement-breakpoint
-- Exact-name `시스템` staff placeholders are not the point-system actor. Keep audit safety by retiring FK targets instead of hard-deleting them.
UPDATE `users`
SET `name` = '삭제된 시스템 계정',
	`status` = 'deleted',
	`updated_at` = now(3)
WHERE `name` = '시스템'
	AND `id` NOT IN (
		SELECT `user_id`
		FROM `auth_accounts`
		WHERE `provider` = 'system'
	);
--> statement-breakpoint
UPDATE `staff_profiles`
SET `name` = '삭제된 시스템 계정',
	`updated_at` = now(3)
WHERE `name` = '시스템';
