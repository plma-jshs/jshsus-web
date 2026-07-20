-- codex-contract-cleanup-approved: users.student_no is a student-only compatibility mirror; staff and system users must not need negative bridge values.
ALTER TABLE `users` MODIFY COLUMN `student_no` int;
--> statement-breakpoint
INSERT IGNORE INTO `auth_accounts` (`user_id`, `provider`, `provider_account_id`)
SELECT `id`, 'system', 'points'
FROM `users`
WHERE `student_no` = -900001
ORDER BY `id`
LIMIT 1;
--> statement-breakpoint
UPDATE `users`
SET `student_no` = NULL, `updated_at` = now(3)
WHERE `student_no` < 0;
