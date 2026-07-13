CREATE TABLE `file_cleanup_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`file_id` int,
	`object_key` varchar(512) NOT NULL,
	`target_type` varchar(64),
	`target_id` int,
	`reason` varchar(64) NOT NULL DEFAULT 'target_delete',
	`attempts` int NOT NULL DEFAULT 0,
	`next_attempt_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`last_error` text,
	`locked_by` varchar(64),
	`locked_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `file_cleanup_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `file_cleanup_jobs_object_key_idx` UNIQUE(`object_key`)
);
--> statement-breakpoint
CREATE INDEX `file_cleanup_jobs_due_idx` ON `file_cleanup_jobs` (`next_attempt_at`,`locked_at`);--> statement-breakpoint
CREATE INDEX `file_cleanup_jobs_target_idx` ON `file_cleanup_jobs` (`target_type`,`target_id`);