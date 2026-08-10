ALTER TABLE `account_activation_codes` ADD `school_year` int;--> statement-breakpoint
CREATE INDEX `account_activation_school_year_idx` ON `account_activation_codes` (`school_year`);