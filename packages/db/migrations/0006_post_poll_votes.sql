CREATE TABLE `post_poll_votes` (
	`post_id` int NOT NULL,
	`poll_id` varchar(80) NOT NULL,
	`option_id` varchar(80) NOT NULL,
	`user_id` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `post_poll_votes_post_id_poll_id_user_id_pk` PRIMARY KEY(`post_id`,`poll_id`,`user_id`)
);
--> statement-breakpoint
ALTER TABLE `post_poll_votes` ADD CONSTRAINT `post_poll_votes_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `post_poll_votes` ADD CONSTRAINT `post_poll_votes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `post_poll_votes_option_idx` ON `post_poll_votes` (`post_id`,`poll_id`,`option_id`);
--> statement-breakpoint
CREATE INDEX `post_poll_votes_user_idx` ON `post_poll_votes` (`user_id`);
