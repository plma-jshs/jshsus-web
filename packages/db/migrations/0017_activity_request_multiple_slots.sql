ALTER TABLE `activity_requests`
  ADD COLUMN `activity_slot_ids` JSON NULL AFTER `ends_at`;
