CREATE TABLE `account_activation_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`identity_type` enum('student','staff') NOT NULL,
	`identity_number` int NOT NULL,
	`code_hash` varchar(128) NOT NULL,
	`attempt_count` int NOT NULL DEFAULT 0,
	`issued_by_id` int,
	`used_by_id` int,
	`used_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `account_activation_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_activation_identity_idx` UNIQUE(`identity_type`,`identity_number`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actor_id` int,
	`action` varchar(128) NOT NULL,
	`target_type` varchar(64),
	`target_id` varchar(64),
	`ip_address` varchar(64),
	`user_agent` varchar(500),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'local',
	`provider_account_id` varchar(128),
	`password_hash` varchar(512),
	`password_algorithm` enum('legacy-sha512','argon2id') NOT NULL DEFAULT 'legacy-sha512',
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `auth_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_accounts_provider_idx` UNIQUE(`provider`,`provider_account_id`)
);
--> statement-breakpoint
CREATE TABLE `identity_sequences` (
	`sequence_key` varchar(32) NOT NULL,
	`next_value` int NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `identity_sequences_sequence_key` PRIMARY KEY(`sequence_key`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`label` varchar(128) NOT NULL,
	`description` varchar(500),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_name_idx` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` int NOT NULL,
	`permission_id` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `role_permissions_role_id_permission_id_pk` PRIMARY KEY(`role_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`label` varchar(128) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_name_idx` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`user_id` int NOT NULL,
	`permission_id` int NOT NULL,
	`has_permission` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `user_permissions_user_id_permission_id_pk` PRIMARY KEY(`user_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` int NOT NULL,
	`role_id` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `user_roles_user_id_role_id_pk` PRIMARY KEY(`user_id`,`role_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_no` int,
	`name` varchar(64) NOT NULL,
	`nickname` varchar(16),
	`grade` int,
	`class_no` int,
	`number` int,
	`email` varchar(255),
	`phone` varchar(32),
	`gender` enum('0','1'),
	`user_status` enum('active','restricted','graduated','deleted') NOT NULL DEFAULT 'active',
	`last_login_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_student_no_idx` UNIQUE(`student_no`),
	CONSTRAINT `users_nickname_idx` UNIQUE(`nickname`)
);
--> statement-breakpoint
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
CREATE TABLE `boards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(80) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(500),
	`visibility` enum('public','members','staff','admin') NOT NULL DEFAULT 'members',
	`allow_anonymous` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `boards_id` PRIMARY KEY(`id`),
	CONSTRAINT `boards_slug_idx` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `comment_likes` (
	`comment_id` int NOT NULL,
	`user_id` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `comment_likes_comment_id_user_id_pk` PRIMARY KEY(`comment_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`post_id` int NOT NULL,
	`parent_id` int,
	`author_id` int,
	`content` text NOT NULL,
	`is_hidden` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lost_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lost_item_type` enum('lost','found') NOT NULL,
	`item_name` varchar(160) NOT NULL,
	`location` varchar(160),
	`occurred_at` datetime(3),
	`description` text,
	`lost_item_status` enum('open','matched','closed','hidden') NOT NULL DEFAULT 'open',
	`author_id` int,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `lost_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`public_no` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` longtext NOT NULL,
	`department` varchar(80),
	`author_name` varchar(80),
	`visibility` enum('public','members','staff','admin') NOT NULL DEFAULT 'public',
	`pinned` boolean NOT NULL DEFAULT false,
	`published_at` datetime(3),
	`author_id` int,
	`view_count` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `notices_id` PRIMARY KEY(`id`),
	CONSTRAINT `notices_public_no_idx` UNIQUE(`public_no`)
);
--> statement-breakpoint
CREATE TABLE `petition_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`petition_id` int NOT NULL,
	`author_id` int,
	`content` longtext NOT NULL,
	`answered_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `petition_answers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `petition_participants` (
	`petition_id` int NOT NULL,
	`user_id` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `petition_participants_petition_id_user_id_pk` PRIMARY KEY(`petition_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `petitions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`author_id` int,
	`title` varchar(255) NOT NULL,
	`content` longtext NOT NULL,
	`content_json` json,
	`petition_status` enum('open','awaiting_answer','answered','expired','hidden') NOT NULL DEFAULT 'open',
	`starts_at` datetime(3) NOT NULL,
	`ends_at` datetime(3) NOT NULL,
	`participant_count` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `petitions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `post_likes` (
	`post_id` int NOT NULL,
	`user_id` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `post_likes_post_id_user_id_pk` PRIMARY KEY(`post_id`,`user_id`)
);
--> statement-breakpoint
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
CREATE TABLE `posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`public_no` int NOT NULL,
	`board_id` int NOT NULL,
	`author_id` int,
	`title` varchar(255) NOT NULL,
	`content` longtext NOT NULL,
	`content_json` json,
	`post_status` enum('draft','published') DEFAULT 'published',
	`is_anonymous` boolean NOT NULL DEFAULT false,
	`is_hidden` boolean NOT NULL DEFAULT false,
	`view_count` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `posts_board_public_no_idx` UNIQUE(`board_id`,`public_no`)
);
--> statement-breakpoint
CREATE TABLE `reactions` (
	`reaction_target` enum('post','comment','petition') NOT NULL,
	`target_id` int NOT NULL,
	`user_id` int NOT NULL,
	`reaction_type` enum('like','upvote','downvote') NOT NULL DEFAULT 'like',
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `reactions_reaction_target_target_id_user_id_pk` PRIMARY KEY(`reaction_target`,`target_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`report_target` enum('post','comment','lost_item') NOT NULL,
	`target_id` int NOT NULL,
	`reporter_id` int,
	`dedupe_key` varchar(190),
	`reason` varchar(120) NOT NULL,
	`detail` text,
	`status` varchar(32) NOT NULL DEFAULT 'reviewing',
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `reports_dedupe_key_idx` UNIQUE(`dedupe_key`)
);
--> statement-breakpoint
CREATE TABLE `thanks_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`school_number` varchar(20) NOT NULL,
	`message` text NOT NULL,
	`submitted_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `thanks_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
	CONSTRAINT `dorm_roommate_blocks_not_self_chk` CHECK(`dorm_roommate_blocks`.`student_user_id` <> `dorm_roommate_blocks`.`blocked_user_id`)
);
--> statement-breakpoint
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
CREATE TABLE `files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int,
	`target_type` varchar(64),
	`target_id` int,
	`original_name` varchar(255) NOT NULL,
	`object_key` varchar(512) NOT NULL,
	`mime_type` varchar(120) NOT NULL,
	`size_bytes` int NOT NULL,
	`file_visibility` enum('public','private') NOT NULL DEFAULT 'private',
	`uploaded_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `files_id` PRIMARY KEY(`id`)
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
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`type` varchar(64) NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` varchar(500),
	`link` varchar(500),
	`metadata` json,
	`dedupe_key` varchar(190),
	`read_at` datetime(3),
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `notifications_dedupe_idx` UNIQUE(`dedupe_key`)
);
--> statement-breakpoint
CREATE TABLE `activity_request_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activity_request_id` int NOT NULL,
	`actor_id` int,
	`activity_request_event_type` enum('submitted','approved','rejected','canceled','printed','completed') NOT NULL,
	`note` varchar(500),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `activity_request_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `activity_request_participants` (
	`activity_request_id` int NOT NULL,
	`student_id` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `activity_request_participants_activity_request_id_student_id_pk` PRIMARY KEY(`activity_request_id`,`student_id`)
);
--> statement-breakpoint
CREATE TABLE `activity_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_id` int NOT NULL,
	`created_by_id` int,
	`teacher_id` int,
	`reviewed_by_id` int,
	`location` varchar(160) NOT NULL,
	`starts_at` datetime(3) NOT NULL,
	`ends_at` datetime(3) NOT NULL,
	`activity_slot_ids` json,
	`purpose` varchar(500) NOT NULL,
	`activity_request_status` enum('draft','submitted','approved','rejected','canceled','completed') NOT NULL DEFAULT 'submitted',
	`rejection_reason` varchar(500),
	`issued_number` varchar(64),
	`issued_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `activity_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `activity_requests_issued_number_idx` UNIQUE(`issued_number`)
);
--> statement-breakpoint
CREATE TABLE `device_case_commands` (
	`id` int AUTO_INCREMENT NOT NULL,
	`device_case_id` int NOT NULL,
	`actor_id` int NOT NULL,
	`device_case_command` enum('open','close','sync') NOT NULL,
	`device_case_command_status` enum('queued','sent','succeeded','failed') NOT NULL DEFAULT 'queued',
	`result_message` varchar(500),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`completed_at` datetime(3),
	CONSTRAINT `device_case_commands_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_case_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`device_case_id` int,
	`scheduled_at` datetime(3) NOT NULL,
	`is_open` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `device_case_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_cases` (
	`id` int NOT NULL,
	`last_seen_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`is_connected` boolean NOT NULL DEFAULT false,
	`is_open` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `device_cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dorm_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`room_id` int NOT NULL,
	`user_id` int NOT NULL,
	`year` int NOT NULL,
	`semester` int NOT NULL,
	`bed_position` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `dorm_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `dorm_assignments_user_term_idx` UNIQUE(`user_id`,`year`,`semester`),
	CONSTRAINT `dorm_assignments_bed_idx` UNIQUE(`room_id`,`year`,`semester`,`bed_position`)
);
--> statement-breakpoint
CREATE TABLE `dorm_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`room_id` int NOT NULL,
	`description` varchar(500) NOT NULL,
	`image_url` varchar(500),
	`image_key` varchar(500),
	`dorm_report_status` enum('PENDING','PROCESSING','COMPLETED') NOT NULL DEFAULT 'PENDING',
	`comment` varchar(500),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `dorm_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dorm_rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`capacity` int NOT NULL,
	`grade` int NOT NULL,
	`dorm_name` enum('송죽관','동백관') NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `dorm_rooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `dorm_rooms_dorm_name_name_idx` UNIQUE(`dorm_name`,`name`)
);
--> statement-breakpoint
CREATE TABLE `point_adjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`point_record_id` int NOT NULL,
	`actor_id` int NOT NULL,
	`point_adjustment_action` enum('cancel','restore','correct') NOT NULL,
	`before_point` int NOT NULL,
	`after_point` int NOT NULL,
	`reason` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `point_adjustments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `point_award_cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_id` int NOT NULL,
	`type` varchar(64) NOT NULL,
	`threshold_point` int NOT NULL,
	`point_award_case_status` enum('pending','processing','completed','dismissed') NOT NULL DEFAULT 'pending',
	`handled_by_id` int,
	`handled_at` datetime(3),
	`memo` text,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `point_award_cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `point_reasons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`point_reason_type` enum('PLUS','MINUS','ETC') NOT NULL,
	`point` int NOT NULL,
	`comment` varchar(255) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `point_reasons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `point_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_id` int NOT NULL,
	`teacher_id` int,
	`reason_id` int NOT NULL,
	`reason_type` enum('PLUS','MINUS','ETC'),
	`reason_text` varchar(255),
	`point` int NOT NULL DEFAULT 0,
	`comment` varchar(255) NOT NULL DEFAULT '',
	`base_date` date NOT NULL,
	`canceled_at` datetime(3),
	`restored_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `point_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `roster_import_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`school_year` int NOT NULL,
	`applied_by_id` int,
	`file_name` varchar(255),
	`row_count` int NOT NULL DEFAULT 0,
	`created_count` int NOT NULL DEFAULT 0,
	`updated_count` int NOT NULL DEFAULT 0,
	`unchanged_count` int NOT NULL DEFAULT 0,
	`graduated_count` int NOT NULL DEFAULT 0,
	`applied_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `roster_import_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `school_years` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`is_active` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `school_years_id` PRIMARY KEY(`id`),
	CONSTRAINT `school_years_year_idx` UNIQUE(`year`)
);
--> statement-breakpoint
CREATE TABLE `staff_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`staff_no` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`department` varchar(120),
	`title` varchar(120),
	`managed_classes` json,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `staff_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_profiles_user_id_idx` UNIQUE(`user_id`),
	CONSTRAINT `staff_profiles_staff_no_idx` UNIQUE(`staff_no`),
	CONSTRAINT `staff_profiles_staff_no_six_digit_check` CHECK(`staff_profiles`.`staff_no` between 100000 and 999999)
);
--> statement-breakpoint
CREATE TABLE `student_enrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_id` int NOT NULL,
	`school_year` int NOT NULL,
	`student_no` int NOT NULL,
	`grade` int NOT NULL,
	`class_no` int NOT NULL,
	`number` int NOT NULL,
	`student_enrollment_status` enum('active','graduated','transferred','withdrawn') NOT NULL DEFAULT 'active',
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `student_enrollments_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_enrollments_year_student_idx` UNIQUE(`school_year`,`student_id`),
	CONSTRAINT `student_enrollments_year_student_no_idx` UNIQUE(`school_year`,`student_no`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`student_no` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`grade` int NOT NULL,
	`class_no` int NOT NULL,
	`number` int NOT NULL,
	`current_point` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `students_id` PRIMARY KEY(`id`),
	CONSTRAINT `students_student_no_idx` UNIQUE(`student_no`),
	CONSTRAINT `students_user_id_idx` UNIQUE(`user_id`)
);
--> statement-breakpoint
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
ALTER TABLE `account_activation_codes` ADD CONSTRAINT `account_activation_codes_issued_by_id_users_id_fk` FOREIGN KEY (`issued_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `account_activation_codes` ADD CONSTRAINT `account_activation_codes_used_by_id_users_id_fk` FOREIGN KEY (`used_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_accounts` ADD CONSTRAINT `auth_accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_permissions_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD CONSTRAINT `user_permissions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_permissions` ADD CONSTRAINT `user_permissions_permission_id_permissions_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wake_song_request_events` ADD CONSTRAINT `wake_song_request_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wake_song_request_events` ADD CONSTRAINT `wake_song_events_request_fk` FOREIGN KEY (`wake_song_request_id`) REFERENCES `wake_song_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wake_song_requests` ADD CONSTRAINT `wake_song_requests_requester_id_users_id_fk` FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wake_song_requests` ADD CONSTRAINT `wake_song_requests_reviewed_by_id_users_id_fk` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comment_likes` ADD CONSTRAINT `comment_likes_comment_id_comments_id_fk` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comment_likes` ADD CONSTRAINT `comment_likes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lost_items` ADD CONSTRAINT `lost_items_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notices` ADD CONSTRAINT `notices_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `petition_answers` ADD CONSTRAINT `petition_answers_petition_id_petitions_id_fk` FOREIGN KEY (`petition_id`) REFERENCES `petitions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `petition_answers` ADD CONSTRAINT `petition_answers_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `petition_participants` ADD CONSTRAINT `petition_participants_petition_id_petitions_id_fk` FOREIGN KEY (`petition_id`) REFERENCES `petitions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `petition_participants` ADD CONSTRAINT `petition_participants_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `petitions` ADD CONSTRAINT `petitions_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `post_likes` ADD CONSTRAINT `post_likes_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `post_likes` ADD CONSTRAINT `post_likes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `post_poll_votes` ADD CONSTRAINT `post_poll_votes_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `post_poll_votes` ADD CONSTRAINT `post_poll_votes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `posts` ADD CONSTRAINT `posts_board_id_boards_id_fk` FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `posts` ADD CONSTRAINT `posts_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reactions` ADD CONSTRAINT `reactions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_reporter_id_users_id_fk` FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dorm_roommate_blocks` ADD CONSTRAINT `dorm_roommate_blocks_student_user_id_users_id_fk` FOREIGN KEY (`student_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dorm_roommate_blocks` ADD CONSTRAINT `dorm_roommate_blocks_blocked_user_id_users_id_fk` FOREIGN KEY (`blocked_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dorm_roommate_blocks` ADD CONSTRAINT `dorm_roommate_blocks_submitted_by_users_id_fk` FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `files` ADD CONSTRAINT `files_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `jbs_videos` ADD CONSTRAINT `jbs_videos_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_request_events` ADD CONSTRAINT `activity_request_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_request_events` ADD CONSTRAINT `ar_events_request_fk` FOREIGN KEY (`activity_request_id`) REFERENCES `activity_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_request_participants` ADD CONSTRAINT `activity_participants_request_fk` FOREIGN KEY (`activity_request_id`) REFERENCES `activity_requests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_request_participants` ADD CONSTRAINT `activity_participants_student_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_requests` ADD CONSTRAINT `activity_requests_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_requests` ADD CONSTRAINT `activity_requests_created_by_id_users_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_requests` ADD CONSTRAINT `activity_requests_teacher_id_users_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_requests` ADD CONSTRAINT `activity_requests_reviewed_by_id_users_id_fk` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `device_case_commands` ADD CONSTRAINT `device_case_commands_device_case_id_device_cases_id_fk` FOREIGN KEY (`device_case_id`) REFERENCES `device_cases`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `device_case_commands` ADD CONSTRAINT `device_case_commands_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `device_case_schedules` ADD CONSTRAINT `device_case_schedules_device_case_id_device_cases_id_fk` FOREIGN KEY (`device_case_id`) REFERENCES `device_cases`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dorm_assignments` ADD CONSTRAINT `dorm_assignments_room_id_dorm_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `dorm_rooms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dorm_assignments` ADD CONSTRAINT `dorm_assignments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dorm_reports` ADD CONSTRAINT `dorm_reports_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dorm_reports` ADD CONSTRAINT `dorm_reports_room_id_dorm_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `dorm_rooms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `point_adjustments` ADD CONSTRAINT `point_adjustments_point_record_id_point_records_id_fk` FOREIGN KEY (`point_record_id`) REFERENCES `point_records`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `point_adjustments` ADD CONSTRAINT `point_adjustments_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `point_award_cases` ADD CONSTRAINT `point_award_cases_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `point_award_cases` ADD CONSTRAINT `point_award_cases_handled_by_id_users_id_fk` FOREIGN KEY (`handled_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `point_records` ADD CONSTRAINT `point_records_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `point_records` ADD CONSTRAINT `point_records_teacher_id_users_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `point_records` ADD CONSTRAINT `point_records_reason_id_point_reasons_id_fk` FOREIGN KEY (`reason_id`) REFERENCES `point_reasons`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `roster_import_batches` ADD CONSTRAINT `roster_import_batches_school_year_school_years_year_fk` FOREIGN KEY (`school_year`) REFERENCES `school_years`(`year`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `roster_import_batches` ADD CONSTRAINT `roster_import_batches_applied_by_id_users_id_fk` FOREIGN KEY (`applied_by_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_profiles` ADD CONSTRAINT `staff_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_enrollments` ADD CONSTRAINT `student_enrollments_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_enrollments` ADD CONSTRAINT `student_enrollments_school_year_school_years_year_fk` FOREIGN KEY (`school_year`) REFERENCES `school_years`(`year`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `school_events` ADD CONSTRAINT `school_events_created_by_id_users_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_activation_issuer_idx` ON `account_activation_codes` (`issued_by_id`);--> statement-breakpoint
CREATE INDEX `account_activation_used_idx` ON `account_activation_codes` (`used_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_target_idx` ON `audit_logs` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `auth_accounts_user_provider_idx` ON `auth_accounts` (`user_id`,`provider`);--> statement-breakpoint
CREATE INDEX `wake_song_events_request_idx` ON `wake_song_request_events` (`wake_song_request_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `wake_song_requester_status_idx` ON `wake_song_requests` (`requester_id`,`wake_song_request_status`);--> statement-breakpoint
CREATE INDEX `wake_song_status_created_idx` ON `wake_song_requests` (`wake_song_request_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `wake_song_scheduled_idx` ON `wake_song_requests` (`scheduled_at`);--> statement-breakpoint
CREATE INDEX `comment_likes_user_idx` ON `comment_likes` (`user_id`);--> statement-breakpoint
CREATE INDEX `comments_post_idx` ON `comments` (`post_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `lost_items_status_idx` ON `lost_items` (`lost_item_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `notices_published_idx` ON `notices` (`published_at`,`pinned`);--> statement-breakpoint
CREATE INDEX `petitions_status_ends_idx` ON `petitions` (`petition_status`,`ends_at`);--> statement-breakpoint
CREATE INDEX `post_likes_user_idx` ON `post_likes` (`user_id`);--> statement-breakpoint
CREATE INDEX `post_poll_votes_option_idx` ON `post_poll_votes` (`post_id`,`poll_id`,`option_id`);--> statement-breakpoint
CREATE INDEX `post_poll_votes_user_idx` ON `post_poll_votes` (`user_id`);--> statement-breakpoint
CREATE INDEX `posts_board_created_idx` ON `posts` (`board_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `posts_board_status_created_idx` ON `posts` (`board_id`,`post_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_target_idx` ON `reports` (`report_target`,`target_id`);--> statement-breakpoint
CREATE INDEX `thanks_messages_submitted_idx` ON `thanks_messages` (`submitted_at`);--> statement-breakpoint
CREATE INDEX `thanks_messages_student_idx` ON `thanks_messages` (`school_number`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `dorm_roommate_blocks_student_term_idx` ON `dorm_roommate_blocks` (`student_user_id`,`year`,`semester`);--> statement-breakpoint
CREATE INDEX `dorm_roommate_blocks_blocked_term_idx` ON `dorm_roommate_blocks` (`blocked_user_id`,`year`,`semester`);--> statement-breakpoint
CREATE INDEX `file_cleanup_jobs_due_idx` ON `file_cleanup_jobs` (`next_attempt_at`,`locked_at`);--> statement-breakpoint
CREATE INDEX `file_cleanup_jobs_target_idx` ON `file_cleanup_jobs` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `files_target_idx` ON `files` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `files_object_key_idx` ON `files` (`object_key`);--> statement-breakpoint
CREATE INDEX `jbs_videos_video_idx` ON `jbs_videos` (`youtube_video_id`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_expires_idx` ON `notifications` (`expires_at`);--> statement-breakpoint
CREATE INDEX `activity_request_events_request_idx` ON `activity_request_events` (`activity_request_id`);--> statement-breakpoint
CREATE INDEX `activity_request_participants_student_idx` ON `activity_request_participants` (`student_id`,`activity_request_id`);--> statement-breakpoint
CREATE INDEX `activity_requests_student_idx` ON `activity_requests` (`student_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `activity_requests_creator_idx` ON `activity_requests` (`created_by_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_requests_teacher_idx` ON `activity_requests` (`teacher_id`,`activity_request_status`);--> statement-breakpoint
CREATE INDEX `activity_requests_reviewer_idx` ON `activity_requests` (`reviewed_by_id`,`activity_request_status`);--> statement-breakpoint
CREATE INDEX `device_case_commands_case_idx` ON `device_case_commands` (`device_case_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `device_case_commands_actor_idx` ON `device_case_commands` (`actor_id`);--> statement-breakpoint
CREATE INDEX `dorm_reports_user_idx` ON `dorm_reports` (`user_id`);--> statement-breakpoint
CREATE INDEX `dorm_reports_room_idx` ON `dorm_reports` (`room_id`);--> statement-breakpoint
CREATE INDEX `point_adjustments_record_idx` ON `point_adjustments` (`point_record_id`);--> statement-breakpoint
CREATE INDEX `point_adjustments_actor_idx` ON `point_adjustments` (`actor_id`);--> statement-breakpoint
CREATE INDEX `point_award_cases_student_idx` ON `point_award_cases` (`student_id`,`point_award_case_status`);--> statement-breakpoint
CREATE INDEX `point_records_student_idx` ON `point_records` (`student_id`,`base_date`);--> statement-breakpoint
CREATE INDEX `point_records_teacher_idx` ON `point_records` (`teacher_id`,`base_date`);--> statement-breakpoint
CREATE INDEX `point_records_reason_idx` ON `point_records` (`reason_id`);--> statement-breakpoint
CREATE INDEX `point_records_base_created_idx` ON `point_records` (`base_date`,`created_at`);--> statement-breakpoint
CREATE INDEX `roster_import_batches_year_idx` ON `roster_import_batches` (`school_year`,`applied_at`);--> statement-breakpoint
CREATE INDEX `roster_import_batches_actor_idx` ON `roster_import_batches` (`applied_by_id`,`applied_at`);--> statement-breakpoint
CREATE INDEX `school_years_active_idx` ON `school_years` (`is_active`,`year`);--> statement-breakpoint
CREATE INDEX `student_enrollments_student_idx` ON `student_enrollments` (`student_id`,`school_year`);--> statement-breakpoint
CREATE INDEX `student_enrollments_status_idx` ON `student_enrollments` (`school_year`,`student_enrollment_status`);--> statement-breakpoint
CREATE INDEX `school_events_range_idx` ON `school_events` (`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `school_events_visibility_idx` ON `school_events` (`is_public`,`starts_at`);