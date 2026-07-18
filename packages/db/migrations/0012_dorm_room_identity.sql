CREATE UNIQUE INDEX `dorm_rooms_dorm_name_name_idx` ON `dorm_rooms` (`dorm_name`, `name`);
--> statement-breakpoint
DROP INDEX `dorm_rooms_name_idx` ON `dorm_rooms`;
