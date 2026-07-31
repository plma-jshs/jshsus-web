import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  classifyMigrationTimeline,
  isLoopbackDatabaseHost,
}: {
  classifyMigrationTimeline: (
    databaseTimeline: number[],
    migrationTimeline: Array<{ when: number }>,
  ) => 'current' | 'behind' | 'diverged';
  isLoopbackDatabaseHost: (hostname: string) => boolean;
} = require('./baseline-safety.cjs');

const migrations = [{ when: 100 }, { when: 200 }, { when: 300 }];

describe('baseline migration safety', () => {
  it('accepts a database journal that is a strict prefix of the code timeline', () => {
    expect(classifyMigrationTimeline([100, 200], migrations)).toBe('behind');
  });

  it('accepts a journal that is already current', () => {
    expect(classifyMigrationTimeline([100, 200, 300], migrations)).toBe('current');
  });

  it('rejects empty, divergent, reordered, or future journals', () => {
    expect(classifyMigrationTimeline([], migrations)).toBe('diverged');
    expect(classifyMigrationTimeline([100, 999], migrations)).toBe('diverged');
    expect(classifyMigrationTimeline([200, 100], migrations)).toBe('diverged');
    expect(classifyMigrationTimeline([100, 200, 300, 400], migrations)).toBe('diverged');
  });

  it('only permits destructive baseline reset hosts used by local development', () => {
    expect(isLoopbackDatabaseHost('localhost')).toBe(true);
    expect(isLoopbackDatabaseHost('127.0.0.1')).toBe(true);
    expect(isLoopbackDatabaseHost('mysql')).toBe(true);
    expect(isLoopbackDatabaseHost('iam.jshsus.kr')).toBe(false);
    expect(isLoopbackDatabaseHost('jshsus-php.jshsus.kr')).toBe(false);
  });
});
