CREATE TABLE `dorm_roommate_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_user_id` int NOT NULL,
	`blocked_user_id` int NOT NULL,
	`year` int NOT NULL,
	`semester` int NOT NULL,
	`submitted_by` int,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `dorm_roommate_blocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `dorm_roommate_blocks_pair_term_idx` UNIQUE(`student_user_id`,`blocked_user_id`,`year`,`semester`),
	CONSTRAINT `dorm_roommate_blocks_not_self_chk` CHECK (`student_user_id` <> `blocked_user_id`)
);
--> statement-breakpoint
ALTER TABLE `dorm_roommate_blocks` ADD CONSTRAINT `dorm_roommate_blocks_student_user_id_users_id_fk` FOREIGN KEY (`student_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `dorm_roommate_blocks` ADD CONSTRAINT `dorm_roommate_blocks_blocked_user_id_users_id_fk` FOREIGN KEY (`blocked_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `dorm_roommate_blocks` ADD CONSTRAINT `dorm_roommate_blocks_submitted_by_users_id_fk` FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `dorm_roommate_blocks_student_term_idx` ON `dorm_roommate_blocks` (`student_user_id`,`year`,`semester`);
--> statement-breakpoint
CREATE INDEX `dorm_roommate_blocks_blocked_term_idx` ON `dorm_roommate_blocks` (`blocked_user_id`,`year`,`semester`);
