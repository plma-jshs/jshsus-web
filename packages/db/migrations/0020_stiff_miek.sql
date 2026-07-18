-- codex-contract-cleanup-approved: remove audited legacy/mock schema from pre-production v26
DROP TABLE `song_requests`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_legacy_iam_id_idx`;--> statement-breakpoint
ALTER TABLE `point_reasons` DROP INDEX `point_reasons_legacy_reason_code_idx`;--> statement-breakpoint
ALTER TABLE `students` DROP INDEX `students_legacy_student_id_idx`;--> statement-breakpoint
UPDATE `users`
SET `phone` = CASE
  WHEN `phone` IS NULL OR TRIM(`phone`) = '' THEN NULL
  WHEN REGEXP_REPLACE(`phone`, '[^0-9]', '') REGEXP '^10[0-9]{8}$'
    THEN CONCAT('0', REGEXP_REPLACE(`phone`, '[^0-9]', ''))
  WHEN REGEXP_REPLACE(`phone`, '[^0-9]', '') REGEXP '^010[0-9]{8}$'
    THEN REGEXP_REPLACE(`phone`, '[^0-9]', '')
  ELSE NULL
END;--> statement-breakpoint
UPDATE `users`
SET `gender` = CASE
  WHEN `gender` IS NULL OR TRIM(`gender`) = '' THEN NULL
  WHEN LOWER(TRIM(`gender`)) IN ('1', 'f', 'female', 'woman') THEN '1'
  WHEN LOWER(TRIM(`gender`)) IN ('0', 'm', 'male', 'man') THEN '0'
  ELSE NULL
END;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `gender` enum('0','1');--> statement-breakpoint
ALTER TABLE `point_records` MODIFY COLUMN `teacher_id` int;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `legacy_iam_id`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `legacy_jshsus_id`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `legacy_plma_id`;--> statement-breakpoint
ALTER TABLE `lost_items` DROP COLUMN `metadata`;--> statement-breakpoint
ALTER TABLE `point_reasons` DROP COLUMN `legacy_reason_code`;--> statement-breakpoint
ALTER TABLE `staff_profiles` DROP COLUMN `is_student_affairs_head`;--> statement-breakpoint
ALTER TABLE `students` DROP COLUMN `legacy_student_id`;
