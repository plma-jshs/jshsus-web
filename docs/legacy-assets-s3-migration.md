# Legacy content and asset migration

The migration restores article bodies and media from the legacy
`readDocument.php` pages and moves their assets into the same S3 key layout used
by normal uploads. This fixes articles that were imported with an empty body.

The migration is intentionally dry-run by default:

```sh
pnpm migrate:legacy-assets
pnpm migrate:legacy-assets -- --apply
```

For an operational database, set `MIGRATION_DATABASE_URL` to a short-lived
privileged connection. The script reads the S3 credentials from the environment
(`AWS_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, and
`AWS_SECRET_ACCESS_KEY`). It never stores credentials in the repository.

Public article files are written to
`notice/YYYY-MM-DD/<sha256>.<ext>` or `post/YYYY-MM-DD/<sha256>.<ext>` and
public article references use Direct S3 URLs. Private files keep the
authenticated `/api/files` URL. Existing `legacy/` objects are copied to the
normal target/date layout and their `files` metadata is updated. Re-running the
script is safe: existing S3 objects and matching file rows are reused.

The one-time notice-number correction is separate and idempotent. It assigns
the six notices in the 169–174 range from newest to oldest as 174–169:

```sh
node scripts/reverse-notice-public-numbers.cjs
node scripts/reverse-notice-public-numbers.cjs --apply
```
