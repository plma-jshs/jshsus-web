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

Article files are written to
`notice/YYYY-MM-DD/<sha256>.<ext>` or `post/YYYY-MM-DD/<sha256>.<ext>` and
article references always use `/api/files/:id/content` or
`/api/files/:id/download`. Those endpoints re-check the parent article's
visibility and redirect to a short-lived presigned S3 URL, so hiding an article
also blocks newly requested file URLs. Profile images are the intentional
exception and may keep their public URL. Existing `legacy/` objects are copied
to the normal target/date layout, their `files` metadata is updated, and any
previously stored direct article URLs are rewritten to the API URL. Re-running
the script is safe: existing S3 objects and matching file rows are reused.

The upload bucket must not grant public `s3:GetObject` access to article
prefixes; otherwise a permanent object URL can bypass the API regardless of
presigning. If profile images remain direct URLs, expose only the `profile/`
prefix publicly and keep `notice/`, `post/`, `lost_item/`, and `dorm_report/`
private.

Notice public numbers are normalized chronologically by the database migration
`0003_normalize_notice_public_numbers.sql`; the old range-specific reversal
script was removed so future migrations cannot reintroduce an arbitrary number
ordering.
