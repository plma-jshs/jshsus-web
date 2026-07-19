import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('content report dedupe migration', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'packages/db/migrations/0000_baseline.sql'),
    'utf8',
  );

  it('keeps report deduplication nullable and unique in the baseline schema', () => {
    const start = migration.indexOf('CREATE TABLE `reports`');
    const end = migration.indexOf(';', start);
    const tableDefinition = migration.slice(start, end);

    expect(tableDefinition).toContain('`dedupe_key` varchar(190)');
    expect(tableDefinition).not.toContain('`dedupe_key` varchar(190) NOT NULL');
    expect(tableDefinition).toContain('CONSTRAINT `reports_dedupe_key_idx` UNIQUE(`dedupe_key`)');
    expect(migration).toContain(
      'CREATE INDEX `reports_target_idx` ON `reports` (`report_target`,`target_id`)',
    );
  });
});
