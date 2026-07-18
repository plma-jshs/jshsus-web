CREATE TABLE `roster_import_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`school_year` int NOT NULL,
	`applied_by_id` int,
	`file_name` varchar(255),
	`row_count` int NOT NULL DEFAULT 0,
	`created_count` int NOT NULL DEFAULT 0,
	`updated_count` int NOT NULL DEFAULT 0,
	`unchanged_count` int NOT NULL DEFAULT 0,
	`graduated_count` int NOT NULL DEFAULT 0,
	`applied_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `roster_import_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `school_years` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`is_active` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `school_years_id` PRIMARY KEY(`id`),
	CONSTRAINT `school_years_year_idx` UNIQUE(`year`)
);
--> statement-breakpoint
INSERT INTO `school_years` (`year`, `is_active`)
VALUES (2026, true)
ON DUPLICATE KEY UPDATE `is_active` = VALUES(`is_active`), `updated_at` = now(3);
--> statement-breakpoint
CREATE TABLE `student_enrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_id` int NOT NULL,
	`school_year` int NOT NULL,
	`student_no` int NOT NULL,
	`grade` int NOT NULL,
	`class_no` int NOT NULL,
	`number` int NOT NULL,
	`student_enrollment_status` enum('active','graduated','transferred','withdrawn') NOT NULL DEFAULT 'active',
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `student_enrollments_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_enrollments_year_student_idx` UNIQUE(`school_year`,`student_id`),
	CONSTRAINT `student_enrollments_year_student_no_idx` UNIQUE(`school_year`,`student_no`)
);
--> statement-breakpoint
ALTER TABLE `roster_import_batches` ADD CONSTRAINT `roster_import_batches_school_year_school_years_year_fk` FOREIGN KEY (`school_year`) REFERENCES `school_years`(`year`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `roster_import_batches` ADD CONSTRAINT `roster_import_batches_applied_by_id_users_id_fk` FOREIGN KEY (`applied_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_enrollments` ADD CONSTRAINT `student_enrollments_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_enrollments` ADD CONSTRAINT `student_enrollments_school_year_school_years_year_fk` FOREIGN KEY (`school_year`) REFERENCES `school_years`(`year`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `roster_import_batches_year_idx` ON `roster_import_batches` (`school_year`,`applied_at`);--> statement-breakpoint
CREATE INDEX `roster_import_batches_actor_idx` ON `roster_import_batches` (`applied_by_id`,`applied_at`);--> statement-breakpoint
CREATE INDEX `school_years_active_idx` ON `school_years` (`is_active`,`year`);--> statement-breakpoint
CREATE INDEX `student_enrollments_student_idx` ON `student_enrollments` (`student_id`,`school_year`);--> statement-breakpoint
CREATE INDEX `student_enrollments_status_idx` ON `student_enrollments` (`school_year`,`student_enrollment_status`);--> statement-breakpoint
INSERT INTO `student_enrollments`
  (`student_id`, `school_year`, `student_no`, `grade`, `class_no`, `number`, `student_enrollment_status`)
SELECT
  `id`,
  2026,
  `student_no`,
  `grade`,
  `class_no`,
  `number`,
  CASE WHEN `grade` BETWEEN 1 AND 3 OR `student_no` = 9999 THEN 'active' ELSE 'graduated' END
FROM `students`
ON DUPLICATE KEY UPDATE
  `student_no` = VALUES(`student_no`),
  `grade` = VALUES(`grade`),
  `class_no` = VALUES(`class_no`),
  `number` = VALUES(`number`),
  `student_enrollment_status` = VALUES(`student_enrollment_status`),
  `updated_at` = now(3);
