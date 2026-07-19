import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('content likes migration', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'packages/db/migrations/0000_baseline.sql'),
    'utf8',
  );

  it.each([
    ['post_likes', 'post_id', 'posts'],
    ['comment_likes', 'comment_id', 'comments'],
  ])(
    'gives %s a unique user pair and cascading parent/user references',
    (table, parentId, parent) => {
      const start = migration.indexOf(`CREATE TABLE \`${table}\``);
      const end = migration.indexOf(';', start);
      const tableDefinition = migration.slice(start, end);

      expect(tableDefinition).toMatch(
        new RegExp(
          `CONSTRAINT \`${table}_${parentId}_user_id_pk\` PRIMARY KEY\\(\`${parentId}\`,\`user_id\`\\)`,
        ),
      );
      expect(migration).toMatch(
        new RegExp(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${table}_${parentId}_${parent}_id_fk\` FOREIGN KEY \\(\`${parentId}\`\\) REFERENCES \`${parent}\`\\(\`id\`\\) ON DELETE cascade`,
        ),
      );
      expect(migration).toMatch(
        new RegExp(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${table}_user_id_users_id_fk\` FOREIGN KEY \\(\`user_id\`\\) REFERENCES \`users\`\\(\`id\`\\) ON DELETE cascade`,
        ),
      );
    },
  );
});
