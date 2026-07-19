CREATE TABLE IF NOT EXISTS `thanks_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`school_number` varchar(20) NOT NULL,
	`message` text NOT NULL,
	`submitted_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (now(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (now(3)),
	CONSTRAINT `thanks_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
SET @thanks_messages_submitted_idx_sql = IF(
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'thanks_messages' AND index_name = 'thanks_messages_submitted_idx') = 0,
	'CREATE INDEX `thanks_messages_submitted_idx` ON `thanks_messages` (`submitted_at`)',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE thanks_messages_submitted_idx_stmt FROM @thanks_messages_submitted_idx_sql;
--> statement-breakpoint
EXECUTE thanks_messages_submitted_idx_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE thanks_messages_submitted_idx_stmt;
--> statement-breakpoint
SET @thanks_messages_student_idx_sql = IF(
	(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'thanks_messages' AND index_name = 'thanks_messages_student_idx') = 0,
	'CREATE INDEX `thanks_messages_student_idx` ON `thanks_messages` (`school_number`,`submitted_at`)',
	'SELECT 1'
);
--> statement-breakpoint
PREPARE thanks_messages_student_idx_stmt FROM @thanks_messages_student_idx_sql;
--> statement-breakpoint
EXECUTE thanks_messages_student_idx_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE thanks_messages_student_idx_stmt;
