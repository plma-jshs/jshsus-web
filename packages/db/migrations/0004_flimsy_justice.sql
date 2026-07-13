ALTER TABLE `posts` ADD `content_json` json;--> statement-breakpoint
ALTER TABLE `posts` ADD `post_status` enum('draft','published') DEFAULT 'published';--> statement-breakpoint
CREATE INDEX `posts_board_status_created_idx` ON `posts` (`board_id`,`post_status`,`created_at`);