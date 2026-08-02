-- codex-contract-cleanup-approved: 닉네임은 중복 가능한 표시명이며, 기존 유니크 인덱스를 일반 인덱스로 교체한다.
DROP INDEX `users_nickname_idx` ON `users`;
--> statement-breakpoint
CREATE INDEX `users_nickname_idx` ON `users` (`nickname`);
--> statement-breakpoint
UPDATE `users`
SET `nickname` = `name`, `updated_at` = NOW(3)
WHERE `personal_data_erased_at` IS NULL
  AND (`nickname` IS NULL OR TRIM(`nickname`) = '');
