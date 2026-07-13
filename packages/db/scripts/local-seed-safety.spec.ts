import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type SafetyEnvironment = Record<string, string | undefined>;
type AssertLocalSeedAllowed = (environment: SafetyEnvironment) => string;

const requireCjs = createRequire(`${process.cwd()}/packages/db/scripts/local-seed-safety.spec.ts`);
const { assertLocalSeedAllowed } = requireCjs('./local-seed-safety.cjs') as {
  assertLocalSeedAllowed: AssertLocalSeedAllowed;
};

const allowedEnvironment = {
  NODE_ENV: 'development',
  ALLOW_LOCAL_SEED: 'true',
  DATABASE_URL: 'mysql://jshs_web:password@localhost:3306/jshsus',
};

describe('local demo seed safety gate', () => {
  it('accepts an explicitly enabled local development database', () => {
    expect(assertLocalSeedAllowed(allowedEnvironment)).toBe(allowedEnvironment.DATABASE_URL);
  });

  it('always refuses production', () => {
    expect(() => assertLocalSeedAllowed({ ...allowedEnvironment, NODE_ENV: 'production' })).toThrow(
      'NODE_ENV=production',
    );
  });

  it('requires explicit opt-in', () => {
    expect(() =>
      assertLocalSeedAllowed({ ...allowedEnvironment, ALLOW_LOCAL_SEED: 'false' }),
    ).toThrow('ALLOW_LOCAL_SEED=true');
  });

  it('refuses a remote database host', () => {
    expect(() =>
      assertLocalSeedAllowed({
        ...allowedEnvironment,
        DATABASE_URL: 'mysql://jshs_web:password@iam.jshsus.kr:3306/jshsus',
      }),
    ).toThrow('non-local database host');
  });

  it('refuses a production-like database name even through localhost', () => {
    expect(() =>
      assertLocalSeedAllowed({
        ...allowedEnvironment,
        DATABASE_URL: 'mysql://jshs_web:password@localhost:3306/jshsus_v26',
      }),
    ).toThrow('non-local database name');
  });

  it('refuses non-MySQL URLs', () => {
    expect(() =>
      assertLocalSeedAllowed({
        ...allowedEnvironment,
        DATABASE_URL: 'postgres://jshs_web:password@localhost:5432/jshsus',
      }),
    ).toThrow('mysql protocol');
  });
});
