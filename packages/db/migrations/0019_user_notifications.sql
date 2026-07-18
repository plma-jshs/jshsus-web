ALTER TABLE notifications ADD COLUMN body varchar(500) NULL;
--> statement-breakpoint
ALTER TABLE notifications ADD COLUMN metadata json NULL;
--> statement-breakpoint
ALTER TABLE notifications ADD COLUMN dedupe_key varchar(190) NULL;
--> statement-breakpoint
ALTER TABLE notifications ADD COLUMN expires_at datetime(3) NULL;
--> statement-breakpoint
UPDATE notifications SET expires_at = DATE_ADD(created_at, INTERVAL 7 DAY) WHERE expires_at IS NULL;
--> statement-breakpoint
ALTER TABLE notifications ADD CONSTRAINT notifications_expires_at_required CHECK (COALESCE(expires_at, '1000-01-01 00:00:00') > '1000-01-01 00:00:00');
--> statement-breakpoint
CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at);
--> statement-breakpoint
CREATE INDEX notifications_expires_idx ON notifications (expires_at);
--> statement-breakpoint
CREATE UNIQUE INDEX notifications_dedupe_idx ON notifications (dedupe_key);
