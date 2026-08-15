-- Keep the public notice number in chronological publication order.
-- Move existing values out of the unique-index range before assigning ranks.
CREATE TEMPORARY TABLE `notice_public_number_ranks` AS
SELECT
  `id`,
  ROW_NUMBER() OVER (ORDER BY `published_at` IS NULL, `published_at` ASC, `id` ASC) AS `public_no`
FROM `notices`;
--> statement-breakpoint
UPDATE `notices`
SET `public_no` = `public_no` + 1000000;
--> statement-breakpoint
UPDATE `notices` AS `notice`
INNER JOIN `notice_public_number_ranks` AS `ranked` ON `ranked`.`id` = `notice`.`id`
SET `notice`.`public_no` = `ranked`.`public_no`;
--> statement-breakpoint
DROP TEMPORARY TABLE `notice_public_number_ranks`;
