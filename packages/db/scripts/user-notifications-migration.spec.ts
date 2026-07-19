import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('user notification migration', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'packages/db/migrations/0000_baseline.sql'),
    'utf8',
  );

  it('keeps notification delivery fields and expiry indexes in the baseline schema', () => {
    const start = migration.indexOf('CREATE TABLE `notifications`');
    const end = migration.indexOf(';', start);
    const tableDefinition = migration.slice(start, end);

    expect(tableDefinition).toContain('`body` varchar(500)');
    expect(tableDefinition).toContain('`metadata` json');
    expect(tableDefinition).toContain('`dedupe_key` varchar(190)');
    expect(tableDefinition).toContain('`expires_at` datetime(3) NOT NULL');
    expect(tableDefinition).toContain('CONSTRAINT `notifications_dedupe_idx` UNIQUE(`dedupe_key`)');
    expect(migration).toContain(
      'CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`,`read_at`)',
    );
    expect(migration).toContain(
      'CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`,`created_at`)',
    );
    expect(migration).toContain(
      'CREATE INDEX `notifications_expires_idx` ON `notifications` (`expires_at`)',
    );
  });
});
