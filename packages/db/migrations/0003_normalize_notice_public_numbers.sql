-- Keep the public notice number in chronological publication order.
-- Stage existing values with the primary key before assigning ranks. This
-- avoids arithmetic overflow in legacy public numbers and remains valid when
-- an older schema uses an unsigned or non-negative public number column.
-- The ranking query intentionally uses a user variable instead of a temporary
-- table or a window function: the migration account only needs the normal
-- table privileges, and this also works on older MySQL-compatible servers.
--> statement-breakpoint
UPDATE `notices`
SET `public_no` = `id` + 1000000;
--> statement-breakpoint
UPDATE `notices` AS `notice`
INNER JOIN (
  SELECT
    `ordered`.`id` AS `ranked_id`,
    (@notice_public_no_row := @notice_public_no_row + 1) AS `new_public_no`
  FROM (
    SELECT `id`
    FROM `notices`
    ORDER BY `published_at` IS NULL, `published_at` ASC, `id` ASC
  ) AS `ordered`
  CROSS JOIN (SELECT @notice_public_no_row := 0) AS `counter`
) AS `ranked` ON `ranked`.`ranked_id` = `notice`.`id`
SET `notice`.`public_no` = `ranked`.`new_public_no`;
