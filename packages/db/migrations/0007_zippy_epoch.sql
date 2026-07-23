-- codex-contract-cleanup-approved: content public numbers are backfilled before being contracted to NOT NULL, and obsolete legacy identity columns are no longer read by application code.
-- codex-data-purge-approved: lost-item data was explicitly reset; files are first enqueued in file_cleanup_jobs so object storage cleanup remains durable.
SET @add_notices_public_no_sql = IF(
	(SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notices' AND column_name = 'public_no') = 0,
	'ALTER TABLE `notices` ADD `public_no` int',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE add_notices_public_no_stmt FROM @add_notices_public_no_sql;
--> statement-breakpoint
EXECUTE add_notices_public_no_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE add_notices_public_no_stmt;
--> statement-breakpoint
SET @add_posts_public_no_sql = IF(
	(SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'posts' AND column_name = 'public_no') = 0,
	'ALTER TABLE `posts` ADD `public_no` int',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE add_posts_public_no_stmt FROM @add_posts_public_no_sql;
--> statement-breakpoint
EXECUTE add_posts_public_no_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE add_posts_public_no_stmt;
--> statement-breakpoint
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
--> statement-breakpoint
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
SET @drop_students_legacy_student_id_sql = IF(
	(SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'students' AND column_name = 'legacy_student_id') = 1,
	'ALTER TABLE `students` DROP COLUMN `legacy_student_id`',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE drop_students_legacy_student_id_stmt FROM @drop_students_legacy_student_id_sql;
--> statement-breakpoint
EXECUTE drop_students_legacy_student_id_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE drop_students_legacy_student_id_stmt;
--> statement-breakpoint
SET @drop_staff_profiles_legacy_staff_id_sql = IF(
	(SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'staff_profiles' AND column_name = 'legacy_staff_id') = 1,
	'ALTER TABLE `staff_profiles` DROP COLUMN `legacy_staff_id`',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE drop_staff_profiles_legacy_staff_id_stmt FROM @drop_staff_profiles_legacy_staff_id_sql;
--> statement-breakpoint
EXECUTE drop_staff_profiles_legacy_staff_id_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE drop_staff_profiles_legacy_staff_id_stmt;
--> statement-breakpoint
UPDATE `notices` n
INNER JOIN (
	SELECT
		`id`,
		row_number() OVER (ORDER BY coalesce(`published_at`, `created_at`), `id`) AS `next_public_no`
	FROM `notices`
) ordered_notices ON ordered_notices.`id` = n.`id`
SET n.`public_no` = ordered_notices.`next_public_no`;
--> statement-breakpoint
UPDATE `posts` p
INNER JOIN (
	SELECT
		`id`,
		row_number() OVER (
			PARTITION BY `board_id`
			ORDER BY `created_at`, `id`
		) AS `next_public_no`
	FROM `posts`
) ordered_posts ON ordered_posts.`id` = p.`id`
SET p.`public_no` = ordered_posts.`next_public_no`;
--> statement-breakpoint
ALTER TABLE `notices` MODIFY COLUMN `public_no` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `posts` MODIFY COLUMN `public_no` int NOT NULL;
--> statement-breakpoint
INSERT INTO `file_cleanup_jobs` (
	`file_id`,
	`object_key`,
	`target_type`,
	`target_id`,
	`reason`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`object_key`,
	`target_type`,
	`target_id`,
	'lost_item_cleanup',
	now(3),
	now(3)
FROM `files`
WHERE `target_type` = 'lost_item'
ON DUPLICATE KEY UPDATE
	`target_type` = VALUES(`target_type`),
	`target_id` = VALUES(`target_id`),
	`reason` = VALUES(`reason`),
	`updated_at` = now(3);
--> statement-breakpoint
DELETE FROM `files` WHERE `target_type` = 'lost_item';
--> statement-breakpoint
DELETE FROM `reports` WHERE `report_target` = 'lost_item';
--> statement-breakpoint
DELETE FROM `lost_items`;
--> statement-breakpoint
ALTER TABLE `lost_items` AUTO_INCREMENT = 1;
--> statement-breakpoint
SET @add_notices_public_no_idx_sql = IF(
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'notices' AND index_name = 'notices_public_no_idx') = 0,
	'ALTER TABLE `notices` ADD CONSTRAINT `notices_public_no_idx` UNIQUE(`public_no`)',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE add_notices_public_no_idx_stmt FROM @add_notices_public_no_idx_sql;
--> statement-breakpoint
EXECUTE add_notices_public_no_idx_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE add_notices_public_no_idx_stmt;
--> statement-breakpoint
SET @add_posts_board_public_no_idx_sql = IF(
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'posts' AND index_name = 'posts_board_public_no_idx') = 0,
	'ALTER TABLE `posts` ADD CONSTRAINT `posts_board_public_no_idx` UNIQUE(`board_id`,`public_no`)',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE add_posts_board_public_no_idx_stmt FROM @add_posts_board_public_no_idx_sql;
--> statement-breakpoint
EXECUTE add_posts_board_public_no_idx_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE add_posts_board_public_no_idx_stmt;
