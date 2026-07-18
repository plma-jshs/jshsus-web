import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('user notification migration', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'packages/db/migrations/0019_user_notifications.sql'),
    'utf8',
  );

  it('expands the existing notification table without dropping legacy data', () => {
    expect(migration).toContain('ADD COLUMN body varchar(500) NULL');
    expect(migration).toContain('ADD COLUMN metadata json NULL');
    expect(migration).toContain('ADD COLUMN dedupe_key varchar(190) NULL');
    expect(migration).toContain('ADD COLUMN expires_at datetime(3) NULL');
    expect(migration).toContain('DATE_ADD(created_at, INTERVAL 7 DAY)');
    expect(migration).toContain("CHECK (COALESCE(expires_at, '1000-01-01 00:00:00')");
    expect(migration).toContain('CREATE UNIQUE INDEX notifications_dedupe_idx');
    expect(migration).not.toMatch(/DELETE|DROP|TRUNCATE/i);
  });
});
