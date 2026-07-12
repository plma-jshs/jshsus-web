CREATE TABLE `school_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(160) NOT NULL,
	`description` text,
	`category` varchar(40) NOT NULL DEFAULT 'school',
	`starts_at` datetime(3) NOT NULL,
	`ends_at` datetime(3) NOT NULL,
	`all_day` boolean NOT NULL DEFAULT true,
	`is_holiday` boolean NOT NULL DEFAULT false,
	`is_public` boolean NOT NULL DEFAULT true,
	`created_by_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `school_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `school_events` ADD CONSTRAINT `school_events_created_by_id_users_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `school_events_range_idx` ON `school_events` (`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `school_events_visibility_idx` ON `school_events` (`is_public`,`starts_at`);