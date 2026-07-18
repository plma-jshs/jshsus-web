ALTER TABLE `staff_profiles`
  ADD COLUMN `managed_classes` JSON NULL AFTER `title`;--> statement-breakpoint

ALTER TABLE `point_reasons`
  ADD COLUMN `legacy_reason_code` INT NULL AFTER `id`;--> statement-breakpoint

CREATE UNIQUE INDEX `point_reasons_legacy_reason_code_idx`
  ON `point_reasons` (`legacy_reason_code`);
