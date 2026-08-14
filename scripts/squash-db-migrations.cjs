#!/usr/bin/env node

const { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationDir = path.join(root, 'packages', 'db', 'migrations');
const metaDir = path.join(migrationDir, 'meta');
const journalPath = path.join(metaDir, '_journal.json');
const zeroId = '00000000-0000-0000-0000-000000000000';

const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
const entries = journal.entries.map((entry, index) => {
  if (entry.idx !== index) {
    throw new Error(`Migration journal index mismatch at ${index}.`);
  }
  const sqlPath = path.join(migrationDir, `${entry.tag}.sql`);
  if (!existsSync(sqlPath)) {
    throw new Error(`Missing migration SQL: ${sqlPath}`);
  }
  return { ...entry, sqlPath };
});

if (entries.length === 0 || entries[0].tag !== '0000_baseline') {
  throw new Error('The migration timeline must start at 0000_baseline.');
}

const latestEntry = entries.at(-1);
const latestSnapshotPath = path.join(metaDir, `${latestEntry.tag.slice(0, 4)}_snapshot.json`);
if (!existsSync(latestSnapshotPath)) {
  throw new Error(`Missing latest migration snapshot: ${latestSnapshotPath}`);
}

const squashedSql = `${entries
  .map(({ tag, sqlPath }) => {
    const sql = readFileSync(sqlPath, 'utf8').trim();
    return `-- squashed from ${tag}\n${sql}`;
  })
  .join('\n--> statement-breakpoint\n')}\n`;
const latestSnapshot = JSON.parse(readFileSync(latestSnapshotPath, 'utf8'));
const squashedSnapshot = {
  ...latestSnapshot,
  prevId: zeroId,
};

if (entries.length === 1) {
  const baselinePath = path.join(migrationDir, '0000_baseline.sql');
  const baselineSql = readFileSync(baselinePath, 'utf8');
  const summary = {
    migrations: entries.map(({ tag }) => tag),
    latestTag: latestEntry.tag,
    latestWhen: latestEntry.when,
    squashedSqlBytes: Buffer.byteLength(baselineSql),
    currentTables: Object.keys(squashedSnapshot.tables ?? {}).length,
  };

  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('Migration timeline is already squashed into 0000_baseline.sql.');
  }
  process.exit(0);
}

const squashedJournal = {
  ...journal,
  entries: [
    {
      idx: 0,
      version: journal.entries[0].version,
      when: latestEntry.when,
      tag: '0000_baseline',
      breakpoints: true,
    },
  ],
};

if (!process.argv.includes('--apply')) {
  console.log(
    JSON.stringify(
      {
        migrations: entries.map(({ tag }) => tag),
        latestTag: latestEntry.tag,
        latestWhen: latestEntry.when,
        squashedSqlBytes: Buffer.byteLength(squashedSql),
        currentTables: Object.keys(squashedSnapshot.tables ?? {}).length,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

writeFileSync(path.join(migrationDir, '0000_baseline.sql'), squashedSql);
for (const { tag } of entries.slice(1)) {
  unlinkSync(path.join(migrationDir, `${tag}.sql`));
}

for (const file of readdirSync(metaDir)) {
  if (/^\d+_snapshot\.json$/.test(file) && file !== '0000_snapshot.json') {
    unlinkSync(path.join(metaDir, file));
  }
}
writeFileSync(
  path.join(metaDir, '0000_snapshot.json'),
  `${JSON.stringify(squashedSnapshot, null, 2)}\n`,
);
writeFileSync(journalPath, `${JSON.stringify(squashedJournal, null, 2)}\n`);

console.log(
  `Squashed ${entries.length} migrations into 0000_baseline.sql at ${squashedSql.length} characters.`,
);
