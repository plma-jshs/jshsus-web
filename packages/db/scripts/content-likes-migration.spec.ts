import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('content likes migration', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'packages/db/migrations/0014_content_likes.sql'),
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

      expect(migration).toContain(
        `CONSTRAINT \`${table}_${parentId}_user_id_pk\` PRIMARY KEY (\`${parentId}\`,\`user_id\`)`,
      );
      expect(migration).toContain(
        `FOREIGN KEY (\`${parentId}\`) REFERENCES \`${parent}\`(\`id\`) ON DELETE CASCADE`,
      );
      expect(tableDefinition).toContain(
        'FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE',
      );
    },
  );
});
