UPDATE `activity_request_events`
SET `activity_request_event_type` = 'approved'
WHERE `activity_request_event_type` = 'completed';
--> statement-breakpoint
-- codex-contract-cleanup-approved: normalize legacy activity event before removing completed
ALTER TABLE `activity_request_events` MODIFY COLUMN `activity_request_event_type` enum('submitted','approved','rejected','canceled','printed') NOT NULL;
