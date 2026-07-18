ALTER TABLE users ADD COLUMN nickname varchar(16) NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX users_nickname_idx ON users (nickname);

--> statement-breakpoint
UPDATE boards SET allow_anonymous = 0, updated_at = now(3) WHERE slug = 'free';
