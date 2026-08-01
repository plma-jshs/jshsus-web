CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `activity_request_events_request_created_idx` ON `activity_request_events` (`activity_request_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_requests_status_date_idx` ON `activity_requests` (`activity_request_status`,`starts_at`,`id`);