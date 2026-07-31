CREATE TABLE `privacy_erasure_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policy_key` varchar(64) NOT NULL,
	`dedupe_key` varchar(190),
	`target_user_id` int,
	`privacy_erasure_job_mode` enum('dry_run','apply') NOT NULL,
	`privacy_erasure_job_status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`scheduled_for` datetime(3) NOT NULL,
	`cutoff_at` datetime(3),
	`started_at` datetime(3),
	`completed_at` datetime(3),
	`result_counts` json,
	`error_code` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `privacy_erasure_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `privacy_erasure_jobs_dedupe_idx` UNIQUE(`dedupe_key`)
);
--> statement-breakpoint
CREATE TABLE `privacy_retention_policies` (
	`policy_key` varchar(64) NOT NULL,
	`retention_days` int NOT NULL,
	`privacy_retention_disposition` enum('hard_delete','anonymize','external_lifecycle') NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`approved_by_id` int,
	`approved_at` datetime(3) NOT NULL,
	`approval_reference` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `privacy_retention_policies_policy_key` PRIMARY KEY(`policy_key`)
);
--> statement-breakpoint
UPDATE `users` SET `user_status` = 'active' WHERE `user_status` = 'restricted';--> statement-breakpoint
UPDATE `student_enrollments`
SET `student_enrollment_status` = 'graduated'
WHERE `student_enrollment_status` IN ('transferred', 'withdrawn');--> statement-breakpoint
CREATE TABLE `legacy_activity_archives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source_id` varchar(64) NOT NULL,
	`activity_date` date NOT NULL,
	`time_text` varchar(255) NOT NULL,
	`time_ranges` json NOT NULL,
	`location` varchar(255) NOT NULL,
	`purpose` text NOT NULL,
	`representative_text` varchar(255) NOT NULL,
	`participants_text` text NOT NULL,
	`advisor_teacher_name` varchar(128),
	`support_text` varchar(255),
	`submitted_label` varchar(128),
	`source_payload_hash` varchar(64) NOT NULL,
	`imported_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `legacy_activity_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `legacy_activity_requests_source_idx` UNIQUE(`source_id`)
);--> statement-breakpoint
CREATE INDEX `legacy_activity_requests_date_idx` ON `legacy_activity_archives` (`activity_date`);--> statement-breakpoint
CREATE INDEX `legacy_activity_requests_advisor_idx` ON `legacy_activity_archives` (`advisor_teacher_name`,`activity_date`);--> statement-breakpoint
INSERT IGNORE INTO `legacy_activity_archives`
	(`id`, `source_id`, `activity_date`, `time_text`, `time_ranges`, `location`, `purpose`,
	 `representative_text`, `participants_text`, `advisor_teacher_name`, `support_text`,
	 `submitted_label`, `source_payload_hash`, `imported_at`)
SELECT
	`id`, `source_id`, `activity_date`, `time_text`, `time_ranges`, `location`, `purpose`,
	`representative_text`, `participants_text`, `advisor_teacher_name`, `support_text`,
	`submitted_label`, `source_payload_hash`, `imported_at`
FROM `legacy_activity_requests`;--> statement-breakpoint
ALTER TABLE `users` ADD `status_changed_at` datetime(3) DEFAULT (now(3));--> statement-breakpoint
ALTER TABLE `users` ADD `deactivated_at` datetime(3);--> statement-breakpoint
ALTER TABLE `users` ADD `cognito_delete_after` datetime(3);--> statement-breakpoint
ALTER TABLE `users` ADD `personal_data_erased_at` datetime(3);--> statement-breakpoint
ALTER TABLE `student_enrollments` ADD `status_changed_at` datetime(3) DEFAULT (now(3));--> statement-breakpoint
ALTER TABLE `privacy_erasure_jobs` ADD CONSTRAINT `privacy_erasure_jobs_target_user_id_users_id_fk` FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `privacy_retention_policies` ADD CONSTRAINT `privacy_retention_policies_approved_by_id_users_id_fk` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `privacy_erasure_jobs_due_idx` ON `privacy_erasure_jobs` (`privacy_erasure_job_status`,`scheduled_for`,`id`);--> statement-breakpoint
CREATE INDEX `privacy_erasure_jobs_policy_idx` ON `privacy_erasure_jobs` (`policy_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `privacy_erasure_jobs_target_idx` ON `privacy_erasure_jobs` (`target_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `privacy_retention_policies_active_idx` ON `privacy_retention_policies` (`is_active`,`retention_days`);--> statement-breakpoint
CREATE INDEX `privacy_retention_policies_approver_idx` ON `privacy_retention_policies` (`approved_by_id`);--> statement-breakpoint
CREATE INDEX `users_status_changed_idx` ON `users` (`user_status`,`status_changed_at`);--> statement-breakpoint
CREATE INDEX `users_cognito_delete_idx` ON `users` (`cognito_delete_after`,`personal_data_erased_at`);--> statement-breakpoint
CREATE INDEX `student_enrollments_status_changed_idx` ON `student_enrollments` (`school_year`,`student_enrollment_status`,`status_changed_at`);--> statement-breakpoint
INSERT INTO `privacy_retention_policies`
  (`policy_key`, `retention_days`, `privacy_retention_disposition`, `is_active`, `approved_at`, `approval_reference`)
VALUES
  ('student_records', 365, 'hard_delete', true, '2026-07-31 00:00:00.000', 'owner-confirmed-2026-07-31'),
  ('legacy_activity_archives', 365, 'hard_delete', true, '2026-07-31 00:00:00.000', 'owner-confirmed-2026-07-31'),
  ('security_logs', 90, 'hard_delete', true, '2026-07-31 00:00:00.000', 'owner-confirmed-2026-07-31'),
  ('cognito_accounts', 30, 'hard_delete', true, '2026-07-31 00:00:00.000', 'owner-confirmed-2026-07-31'),
  ('database_backups', 30, 'external_lifecycle', true, '2026-07-31 00:00:00.000', 'owner-confirmed-2026-07-31'),
  ('account_profile', 0, 'anonymize', true, '2026-07-31 00:00:00.000', 'owner-confirmed-2026-07-31'),
  ('community_authorship', 0, 'anonymize', true, '2026-07-31 00:00:00.000', 'owner-confirmed-2026-07-31'),
  ('thanks_authorship', 0, 'anonymize', true, '2026-07-31 00:00:00.000', 'owner-confirmed-2026-07-31');
