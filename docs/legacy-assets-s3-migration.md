# Legacy asset migration

The current API stores uploaded files in the configured S3 bucket and exposes
them through `/api/files/:id/content`. Legacy notices may still contain inline
URLs from the old PHP site, so those assets need a one-time migration.

The migration is intentionally dry-run by default:

```sh
node scripts/migrate-legacy-assets.cjs
node scripts/migrate-legacy-assets.cjs --apply
```

For an operational database, set `MIGRATION_DATABASE_URL` to a short-lived
privileged connection. The script reads the S3 credentials from the environment
(`AWS_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, and
`AWS_SECRET_ACCESS_KEY`). It never stores credentials in the repository.

The script only migrates binary assets that are referenced by supported content
fields. Ordinary links (Google Forms, YouTube, service URLs, and HTML pages)
remain links. Each object is content-addressed under `legacy/<sha256>/`, the
corresponding public `files` row is created, and the inline URL is replaced
with `/api/files/:id/content`. Re-running the script is safe: existing S3
objects and matching file rows are reused.

The one-time notice-number correction is separate and idempotent. It assigns
the six notices in the 169–174 range from newest to oldest as 174–169:

```sh
node scripts/reverse-notice-public-numbers.cjs
node scripts/reverse-notice-public-numbers.cjs --apply
```
