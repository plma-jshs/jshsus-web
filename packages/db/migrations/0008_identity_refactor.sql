CREATE TEMPORARY TABLE `_staff_number_contract_guard` (
  `invalid_count` int NOT NULL,
  CONSTRAINT `_staff_number_contract_guard_check` CHECK (`invalid_count` = 0)
);
--> statement-breakpoint
INSERT INTO `_staff_number_contract_guard` (`invalid_count`)
SELECT COUNT(*)
FROM `staff_profiles`
WHERE `staff_no` < 100000 OR `staff_no` > 999999;
--> statement-breakpoint
DROP TEMPORARY TABLE `_staff_number_contract_guard`;
--> statement-breakpoint
ALTER TABLE `staff_profiles`
ADD CONSTRAINT `staff_profiles_staff_no_six_digit_check`
CHECK (`staff_no` BETWEEN 100000 AND 999999);
--> statement-breakpoint
CREATE TABLE `identity_sequences` (
	`sequence_key` varchar(32) NOT NULL,
	`next_value` int NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `identity_sequences_sequence_key` PRIMARY KEY(`sequence_key`)
);
--> statement-breakpoint
INSERT IGNORE INTO `user_roles` (`user_id`, `role_id`)
SELECT `staff_profiles`.`user_id`, `roles`.`id`
FROM `staff_profiles`
INNER JOIN `roles` ON `roles`.`name` = 'student_affairs_head'
WHERE `staff_profiles`.`is_student_affairs_head` = 1;
--> statement-breakpoint
UPDATE `auth_accounts`
INNER JOIN `users` ON `users`.`id` = `auth_accounts`.`user_id`
LEFT JOIN `students` ON `students`.`user_id` = `users`.`id`
LEFT JOIN `staff_profiles` ON `staff_profiles`.`user_id` = `users`.`id`
SET `auth_accounts`.`provider_account_id` = COALESCE(
  CAST(`students`.`student_no` AS CHAR),
  CAST(`staff_profiles`.`staff_no` AS CHAR)
)
WHERE `auth_accounts`.`provider` = 'local'
  AND (`students`.`id` IS NOT NULL OR `staff_profiles`.`id` IS NOT NULL);
--> statement-breakpoint
UPDATE `auth_accounts`
INNER JOIN `users` ON `users`.`id` = `auth_accounts`.`user_id`
SET `auth_accounts`.`provider_account_id` = COALESCE(
  NULLIF(`users`.`legacy_jshsus_id`, ''),
  CAST(`users`.`student_no` AS CHAR)
)
WHERE `auth_accounts`.`provider` = 'local'
  AND (`auth_accounts`.`provider_account_id` IS NULL OR `auth_accounts`.`provider_account_id` = '');
--> statement-breakpoint
UPDATE `users`
INNER JOIN `staff_profiles` ON `staff_profiles`.`user_id` = `users`.`id`
SET `users`.`student_no` = -`staff_profiles`.`staff_no`;
--> statement-breakpoint
INSERT INTO `identity_sequences` (`sequence_key`, `next_value`)
SELECT 'staff_number', GREATEST(COALESCE(MAX(`staff_no`) + 1, 100000), 100000)
FROM `staff_profiles`;
