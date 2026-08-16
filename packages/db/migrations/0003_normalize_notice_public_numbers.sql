-- Keep the public notice number in chronological publication order.
-- Stage existing values with the primary key before assigning ranks. This
-- avoids arithmetic overflow in legacy public numbers and remains valid when
-- an older schema uses an unsigned or non-negative public number column.
-- The ranking update intentionally uses a user variable instead of a
-- temporary table, a window function, or an UPDATE ... JOIN over `notices`.
-- The latter is rejected by some MySQL-compatible servers as a target-table
-- self reference (error 1093). A single-table UPDATE with ORDER BY keeps the
-- operation within the normal table privileges and works on those servers.
--> statement-breakpoint
UPDATE `notices`
SET `public_no` = `id` + 1000000;
--> statement-breakpoint
SET @notice_public_no_row := 0;
--> statement-breakpoint
UPDATE `notices`
SET `public_no` = (@notice_public_no_row := @notice_public_no_row + 1)
ORDER BY `published_at` IS NULL, `published_at` ASC, `id` ASC;
