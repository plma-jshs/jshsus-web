ALTER TABLE `activity_requests`
ADD COLUMN `created_by_id` int NULL,
ADD COLUMN `reviewed_by_id` int NULL;
--> statement-breakpoint
ALTER TABLE `activity_requests`
ADD CONSTRAINT `activity_requests_created_by_id_users_id_fk`
FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
ADD CONSTRAINT `activity_requests_reviewed_by_id_users_id_fk`
FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX `activity_requests_creator_idx`
ON `activity_requests` (`created_by_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `activity_requests_reviewer_idx`
ON `activity_requests` (`reviewed_by_id`, `activity_request_status`);
--> statement-breakpoint
CREATE TABLE `activity_request_participants` (
	`activity_request_id` int NOT NULL,
	`student_id` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `activity_request_participants_activity_request_id_student_id_pk`
		PRIMARY KEY(`activity_request_id`, `student_id`),
	CONSTRAINT `activity_request_participants_request_fk`
		FOREIGN KEY (`activity_request_id`) REFERENCES `activity_requests`(`id`)
		ON DELETE CASCADE ON UPDATE NO ACTION,
	CONSTRAINT `activity_request_participants_student_id_students_id_fk`
		FOREIGN KEY (`student_id`) REFERENCES `students`(`id`)
		ON DELETE NO ACTION ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX `activity_request_participants_student_idx`
ON `activity_request_participants` (`student_id`, `activity_request_id`);
--> statement-breakpoint
INSERT IGNORE INTO `activity_request_participants` (`activity_request_id`, `student_id`)
SELECT `id`, `student_id`
FROM `activity_requests`;
--> statement-breakpoint
UPDATE `activity_requests`
INNER JOIN `students` ON `students`.`id` = `activity_requests`.`student_id`
SET `activity_requests`.`created_by_id` = `students`.`user_id`
WHERE `activity_requests`.`created_by_id` IS NULL
  AND `students`.`user_id` IS NOT NULL;
--> statement-breakpoint
UPDATE `activity_requests`
SET `reviewed_by_id` = `teacher_id`
WHERE `reviewed_by_id` IS NULL
  AND `teacher_id` IS NOT NULL
  AND `activity_request_status` IN ('approved', 'rejected', 'completed');
--> statement-breakpoint
UPDATE `activity_requests`
SET `teacher_id` = NULL
WHERE `reviewed_by_id` IS NOT NULL
  AND `activity_request_status` IN ('approved', 'rejected', 'completed');
