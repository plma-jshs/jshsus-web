ALTER TABLE reports ADD COLUMN dedupe_key varchar(190) NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX reports_dedupe_key_idx ON reports (dedupe_key);
