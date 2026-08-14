UPDATE `activity_requests`
SET `activity_request_status` = 'approved'
WHERE `activity_request_status` = 'completed';
--> statement-breakpoint
-- codex-contract-cleanup-approved: normalize legacy activity status before removing completed
ALTER TABLE `activity_requests` MODIFY COLUMN `activity_request_status` enum('draft','submitted','approved','rejected','canceled') NOT NULL DEFAULT 'submitted';
