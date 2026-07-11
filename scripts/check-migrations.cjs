#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const migrationDir = path.resolve('packages/db/migrations');
const files = fs
  .readdirSync(migrationDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

const journal = JSON.parse(
  fs.readFileSync(path.join(migrationDir, 'meta', '_journal.json'), 'utf8'),
);
const journalTags = journal.entries.map((entry, index) => {
  if (entry.idx !== index || !/^\d{4}_[A-Za-z0-9_]+$/.test(entry.tag)) {
    throw new Error(`Invalid migration journal entry at index ${index}.`);
  }
  return `${entry.tag}.sql`;
});
if (JSON.stringify(journalTags) !== JSON.stringify(files)) {
  throw new Error('Migration SQL files and meta/_journal.json are out of sync.');
}

const forbidden = [
  ['TRUNCATE', /\bTRUNCATE\b/i],
  ['DELETE without a compatibility window', /\bDELETE\s+FROM\b/i],
  [
    'DROP DATABASE, TABLE, VIEW, INDEX, or COLUMN',
    /\bDROP\s+(?:DATABASE|TABLE|VIEW|INDEX|COLUMN)\b/i,
  ],
  ['ALTER TABLE ... DROP', /\bALTER\s+TABLE\b[\s\S]*?\bDROP\b/i],
  ['RENAME TABLE or COLUMN', /\bRENAME\s+(?:TABLE|COLUMN)\b/i],
  ['ALTER TABLE ... RENAME', /\bALTER\s+TABLE\b[\s\S]*?\bRENAME\b/i],
  ['CHANGE COLUMN', /\bCHANGE\s+(?:COLUMN\s+)?`?[A-Za-z0-9_]+`?/i],
  ['MODIFY COLUMN', /\bMODIFY\s+(?:COLUMN\s+)?`?[A-Za-z0-9_]+`?/i],
  [
    'ADD NOT NULL column without an expand phase',
    /\bALTER\s+TABLE\b[\s\S]*?\bADD\s+(?:COLUMN\s+)?[\s\S]*?\bNOT\s+NULL\b/i,
  ],
  ['REPLACE INTO', /\bREPLACE\s+INTO\b/i],
  ['CREATE OR REPLACE', /\bCREATE\s+OR\s+REPLACE\b/i],
];

const failures = [];
for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
  const statements = sql.split(/;\s*(?:--[^\n]*)?\n|-->\s*statement-breakpoint/i);
  for (const statement of statements) {
    const normalized = statement
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(?:--|#)[^\n]*/g, ' ')
      .trim();
    if (!normalized) continue;
    for (const [label, pattern] of forbidden) {
      if (pattern.test(normalized)) failures.push(`${file}: ${label}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Migration policy rejected destructive or rollback-incompatible SQL:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  console.error('Use a multi-release expand/contract migration instead.');
  process.exit(1);
}

console.log(`Migration policy passed (${files.length} files).`);
