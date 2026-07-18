ALTER TABLE `point_records`
ADD COLUMN `reason_type` enum('PLUS','MINUS','ETC');
--> statement-breakpoint
ALTER TABLE `point_records`
ADD COLUMN `reason_text` varchar(255);
--> statement-breakpoint
UPDATE `point_records`
INNER JOIN `point_reasons` ON `point_reasons`.`id` = `point_records`.`reason_id`
SET
  `point_records`.`reason_type` = `point_reasons`.`point_reason_type`,
  `point_records`.`reason_text` = `point_reasons`.`comment`
WHERE `point_records`.`reason_type` IS NULL
   OR `point_records`.`reason_text` IS NULL;
--> statement-breakpoint
CREATE INDEX `point_records_base_created_idx`
ON `point_records` (`base_date`, `created_at`);
