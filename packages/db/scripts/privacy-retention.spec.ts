import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  POLICY_APPROVAL,
  REQUIRED_POLICIES,
  STUDENT_RECORD_DATE_FIELDS,
  assertNotLegacyDatabaseUrl,
  cutoffFrom,
  parseOptions,
  safeErrorCode,
}: {
  POLICY_APPROVAL: string;
  REQUIRED_POLICIES: Record<string, { retentionDays: number; disposition: string }>;
  STUDENT_RECORD_DATE_FIELDS: Record<string, string>;
  assertNotLegacyDatabaseUrl: (databaseUrl: string) => void;
  cutoffFrom: (value: Date, days: number) => Date;
  parseOptions: (argv: string[]) => { apply: boolean; confirmPolicy: string };
  safeErrorCode: (error: unknown) => string;
} = require('./privacy-retention.cjs');

describe('privacy retention command safety', () => {
  it('stays in dry-run mode by default', () => {
    expect(parseOptions([])).toEqual({ apply: false, confirmPolicy: '' });
  });

  it('requires the approved policy reference for destructive execution', () => {
    expect(() => parseOptions(['--apply'])).toThrow();
    expect(parseOptions(['--apply', '--confirm-policy', POLICY_APPROVAL])).toMatchObject({
      apply: true,
    });
  });

  it('calculates exact day-based retention cutoffs', () => {
    expect(cutoffFrom(new Date('2027-08-01T00:00:00.000Z'), 365).toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });

  it('hard-deletes legacy activity originals one year after activity_date', () => {
    expect(REQUIRED_POLICIES.legacy_activity_archives).toEqual({
      retentionDays: 365,
      disposition: 'hard_delete',
    });
  });

  it('uses each inactive student record date instead of the account status date', () => {
    expect(STUDENT_RECORD_DATE_FIELDS).toEqual({
      pointRecords: 'base_date',
      pointCases: 'created_at',
      activityRequests: 'starts_at',
    });
  });

  it('never exposes provider messages as error codes', () => {
    expect(safeErrorCode({ name: 'Bad Error', message: 'student 1234' })).toBe('Bad_Error');
  });

  it('refuses to target the live PHP legacy database host', () => {
    expect(() =>
      assertNotLegacyDatabaseUrl('mysql://operator:secret@jshsus-php.jshsus.kr/legacy'),
    ).toThrow('LEGACY_DATABASE_TARGET_FORBIDDEN');
    expect(() =>
      assertNotLegacyDatabaseUrl('mysql://operator:secret@iam.jshsus.kr/jshsus'),
    ).not.toThrow();
  });
});
