import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type SafetyEnvironment = Record<string, string | undefined>;
type AssertLocalSeedAllowed = (environment: SafetyEnvironment) => string;

const requireCjs = createRequire(`${process.cwd()}/packages/db/scripts/local-seed-safety.spec.ts`);
const { assertDemoSeedAllowed, assertLocalSeedAllowed, assertStagingSeedAllowed } = requireCjs(
  './local-seed-safety.cjs',
) as {
  assertDemoSeedAllowed: AssertLocalSeedAllowed;
  assertLocalSeedAllowed: AssertLocalSeedAllowed;
  assertStagingSeedAllowed: AssertLocalSeedAllowed;
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

describe('staging demo seed safety gate', () => {
  const stagingEnvironment = {
    NODE_ENV: 'production',
    DEPLOYMENT_TIER: 'staging',
    ALLOW_STAGING_DEMO_SEED: 'true',
    DEMO_SEED_DATABASE_NAME: 'jshsus_v26',
    DATABASE_URL: 'mysql://seed_user:password@iam.jshsus.kr:3306/jshsus_v26',
    TEST_USER_PASSWORD: 'a-long-random-staging-password',
  };

  it('accepts an explicitly confirmed staging database', () => {
    expect(assertStagingSeedAllowed(stagingEnvironment)).toBe(stagingEnvironment.DATABASE_URL);
  });

  it('refuses a database name that was not confirmed exactly', () => {
    expect(() =>
      assertStagingSeedAllowed({
        ...stagingEnvironment,
        DEMO_SEED_DATABASE_NAME: 'jshsus_production',
      }),
    ).toThrow('exactly match');
  });

  it('refuses the local default password on a public staging server', () => {
    expect(() =>
      assertStagingSeedAllowed({ ...stagingEnvironment, TEST_USER_PASSWORD: 'Test1234!' }),
    ).toThrow('non-default value');
  });

  it('also refuses the current local Hello00! fixture password', () => {
    expect(() =>
      assertStagingSeedAllowed({ ...stagingEnvironment, TEST_USER_PASSWORD: 'Hello00!' }),
    ).toThrow('non-default value');
  });

  it('refuses any deployment tier other than staging', () => {
    expect(() =>
      assertStagingSeedAllowed({ ...stagingEnvironment, DEPLOYMENT_TIER: 'production' }),
    ).toThrow('DEPLOYMENT_TIER=staging');
  });

  it('does not silently route a production deployment through the local gate', () => {
    expect(() =>
      assertDemoSeedAllowed({
        ...stagingEnvironment,
        ALLOW_STAGING_DEMO_SEED: 'false',
      }),
    ).toThrow('NODE_ENV=production');
  });
});
