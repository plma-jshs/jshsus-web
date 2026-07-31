CREATE TABLE `legacy_activity_requests` (
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
);
--> statement-breakpoint
CREATE INDEX `legacy_activity_requests_date_idx` ON `legacy_activity_requests` (`activity_date`);
--> statement-breakpoint
CREATE INDEX `legacy_activity_requests_advisor_idx` ON `legacy_activity_requests` (`advisor_teacher_name`,`activity_date`);
