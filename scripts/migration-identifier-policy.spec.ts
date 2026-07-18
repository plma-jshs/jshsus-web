import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const requireCjs = createRequire(`${process.cwd()}/scripts/migration-identifier-policy.spec.ts`);
const { findOverlongMysqlConstraintAndIndexIdentifiers } = requireCjs(
  './migration-identifier-policy.cjs',
) as {
  findOverlongMysqlConstraintAndIndexIdentifiers: (sql: string) => Array<{
    identifier: string;
    keyword: string;
    length: number;
    maxLength: number;
  }>;
};

const identifier = (length: number) => 'x'.repeat(length);

describe('MySQL migration identifier policy', () => {
  it('accepts constraint and index identifiers at the 64-character limit', () => {
    const name = identifier(64);
    expect(
      findOverlongMysqlConstraintAndIndexIdentifiers(`
        ALTER TABLE \`items\` ADD CONSTRAINT \`${name}\` UNIQUE (\`slug\`);
        CREATE UNIQUE INDEX \`${name}\` ON \`items\` (\`slug\`);
      `),
    ).toEqual([]);
  });

  it('rejects overlong constraint and index identifiers', () => {
    const name = identifier(65);
    expect(
      findOverlongMysqlConstraintAndIndexIdentifiers(`
        ALTER TABLE \`items\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`);
        CREATE INDEX \`${name}\` ON \`items\` (\`owner_id\`);
      `),
    ).toEqual([
      { identifier: name, keyword: 'CONSTRAINT', length: 65, maxLength: 64 },
      { identifier: name, keyword: 'INDEX', length: 65, maxLength: 64 },
    ]);
  });

  it('checks named KEY declarations inside CREATE TABLE', () => {
    const name = identifier(65);
    expect(
      findOverlongMysqlConstraintAndIndexIdentifiers(
        `CREATE TABLE \`items\` (\`id\` int, KEY \`${name}\` (\`id\`));`,
      ),
    ).toEqual([{ identifier: name, keyword: 'KEY', length: 65, maxLength: 64 }]);
  });

  it('does not treat table or column identifiers as index identifiers', () => {
    const name = identifier(65);
    expect(
      findOverlongMysqlConstraintAndIndexIdentifiers(
        `CREATE TABLE \`${name}\` (\`${name}\` varchar(20));`,
      ),
    ).toEqual([]);
  });

  it('ignores identifier-like text in comments and string literals', () => {
    const name = identifier(65);
    expect(
      findOverlongMysqlConstraintAndIndexIdentifiers(`
        -- CONSTRAINT \`${name}\`
        /* CREATE INDEX \`${name}\` ON \`items\` (\`id\`); */
        INSERT INTO \`audit_logs\` (\`message\`) VALUES ('KEY \`${name}\`');
      `),
    ).toEqual([]);
  });
});
