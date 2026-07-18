CREATE TABLE `wake_song_request_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`wake_song_request_id` int NOT NULL,
	`actor_id` int,
	`wake_song_request_event_type` enum('SUBMITTED','UPDATED','APPROVED','REJECTED','SCHEDULED','PLAYED','CANCELED') NOT NULL,
	`note` varchar(500),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `wake_song_request_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wake_song_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requester_id` int NOT NULL,
	`youtube_video_id` varchar(32) NOT NULL,
	`canonical_url` varchar(255) NOT NULL,
	`video_title` varchar(255) NOT NULL,
	`channel_title` varchar(255),
	`video_duration_seconds` int,
	`start_seconds` int NOT NULL,
	`end_seconds` int NOT NULL,
	`playback_rate_hundredths` int NOT NULL DEFAULT 100,
	`effective_duration_seconds` int NOT NULL,
	`request_note` varchar(500) NOT NULL DEFAULT '',
	`wake_song_request_status` enum('PENDING','APPROVED','REJECTED','SCHEDULED','PLAYED','CANCELED') NOT NULL DEFAULT 'PENDING',
	`reviewed_by_id` int,
	`reviewed_at` datetime(3),
	`rejection_reason` varchar(500),
	`scheduled_at` datetime(3),
	`played_at` datetime(3),
	`canceled_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `wake_song_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jbs_videos` (
	`post_id` int NOT NULL,
	`youtube_video_id` varchar(11) NOT NULL,
	`canonical_url` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `jbs_videos_post_id_pk` PRIMARY KEY(`post_id`)
);
--> statement-breakpoint
ALTER TABLE `wake_song_request_events` ADD CONSTRAINT `wake_song_request_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wake_song_request_events` ADD CONSTRAINT `wake_song_events_request_fk` FOREIGN KEY (`wake_song_request_id`) REFERENCES `wake_song_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wake_song_requests` ADD CONSTRAINT `wake_song_requests_requester_id_users_id_fk` FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wake_song_requests` ADD CONSTRAINT `wake_song_requests_reviewed_by_id_users_id_fk` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `jbs_videos` ADD CONSTRAINT `jbs_videos_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `wake_song_events_request_idx` ON `wake_song_request_events` (`wake_song_request_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `wake_song_requester_status_idx` ON `wake_song_requests` (`requester_id`,`wake_song_request_status`);--> statement-breakpoint
CREATE INDEX `wake_song_status_created_idx` ON `wake_song_requests` (`wake_song_request_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `wake_song_scheduled_idx` ON `wake_song_requests` (`scheduled_at`);--> statement-breakpoint
CREATE INDEX `jbs_videos_video_idx` ON `jbs_videos` (`youtube_video_id`);--> statement-breakpoint

INSERT INTO `roles` (`name`, `label`) VALUES
  ('broadcast_club', '방송부')
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`), `updated_at` = now(3);--> statement-breakpoint

UPDATE `roles`
SET `label` = '학생관리부장', `updated_at` = now(3)
WHERE `name` = 'student_affairs_head';--> statement-breakpoint

INSERT INTO `permissions` (`name`, `label`, `description`) VALUES
  ('jbs.publish', 'JBS 게시', '방송부 영상과 설명을 JBS에 게시합니다.'),
  ('wake_songs.review', '기상곡 승인 및 편성', '기상곡 신청을 승인·반려하고 편성 및 재생 상태를 관리합니다.')
ON DUPLICATE KEY UPDATE
  `label` = VALUES(`label`),
  `description` = VALUES(`description`),
  `updated_at` = now(3);--> statement-breakpoint

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
JOIN `permissions` p ON p.name = 'jbs.publish'
WHERE r.name = 'broadcast_club';--> statement-breakpoint

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
JOIN `permissions` p ON p.name = 'wake_songs.review'
WHERE r.name = 'student_affairs_head';--> statement-breakpoint

DELETE rp
FROM `role_permissions` rp
JOIN `roles` r ON r.id = rp.role_id
JOIN `permissions` p ON p.id = rp.permission_id
WHERE r.name = 'student_affairs_head'
  AND p.name = 'petitions.answer';--> statement-breakpoint

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE r.name = 'system_admin';--> statement-breakpoint

INSERT INTO `boards` (`slug`, `name`, `description`, `visibility`, `allow_anonymous`)
VALUES ('jbs', 'JBS', '방송부가 전하는 학교 영상과 소식', 'public', 0)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `visibility` = 'public',
  `allow_anonymous` = 0,
  `updated_at` = now(3);
