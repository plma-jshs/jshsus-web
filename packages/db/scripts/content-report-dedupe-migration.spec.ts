import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('content report dedupe migration', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'packages/db/migrations/0018_content_report_dedupe.sql'),
    'utf8',
  );

  it('uses an expand-only nullable key so legacy duplicate rows remain untouched', () => {
    expect(migration).toContain('ADD COLUMN dedupe_key varchar(190) NULL');
    expect(migration).toContain('CREATE UNIQUE INDEX reports_dedupe_key_idx');
    expect(migration).not.toMatch(/DELETE|UPDATE/i);
  });
});
