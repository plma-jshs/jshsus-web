UPDATE `reports`
SET `status` = 'reviewing',
	`updated_at` = now(3)
WHERE `status` = 'open';
--> statement-breakpoint
ALTER TABLE `reports` ALTER COLUMN `status` SET DEFAULT 'reviewing';
