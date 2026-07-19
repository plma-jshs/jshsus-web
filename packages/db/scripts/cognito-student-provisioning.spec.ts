import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const requireCjs = createRequire(
  `${process.cwd()}/packages/db/scripts/cognito-student-provisioning.spec.ts`,
);
const policy = requireCjs('./cognito-student-provisioning.cjs') as {
  canonicalUsername: (studentNo: number) => string;
  generateTemporaryPassword: (length?: number) => string;
  parseArgs: (argv: string[]) => {
    apply: boolean;
    confirmPoolId: string | null;
    ensureTestAccount: boolean;
    includeTestAccount: boolean;
    studentNo: number | null;
    temporaryPasswordEnv: string | null;
  };
  safeErrorName: (error: unknown) => string;
  safeErrorSummary: (error: unknown) => string;
  validatePoolSupportsStudentNumberLogin: (pool: { AliasAttributes?: string[] }) => void;
  validateTemporaryPassword: (password: string | undefined) => string;
};

describe('Cognito student provisioning policy', () => {
  it('is a dry-run by default and parses explicit apply confirmation', () => {
    expect(policy.parseArgs([])).toMatchObject({
      apply: false,
      confirmPoolId: null,
      ensureTestAccount: false,
      includeTestAccount: false,
      studentNo: null,
      temporaryPasswordEnv: null,
    });
    expect(
      policy.parseArgs([
        '--apply',
        '--confirm-pool-id=ap-northeast-2_example',
        '--student-no',
        '1101',
        '--temporary-password-env',
        'COGNITO_TEMPORARY_PASSWORD',
      ]),
    ).toMatchObject({
      apply: true,
      confirmPoolId: 'ap-northeast-2_example',
      studentNo: 1101,
      temporaryPasswordEnv: 'COGNITO_TEMPORARY_PASSWORD',
    });
  });

  it('strictly gates creation of the staging test fixture', () => {
    expect(() => policy.parseArgs(['--ensure-test-account'])).toThrow(
      '--apply --student-no 9999 --include-test-account',
    );
    expect(
      policy.parseArgs([
        '--apply',
        '--student-no',
        '9999',
        '--include-test-account',
        '--ensure-test-account',
      ]).ensureTestAccount,
    ).toBe(true);
  });

  it('requires explicit inclusion of the local test account', () => {
    expect(() => policy.parseArgs(['--student-no', '9999'])).toThrow('--include-test-account');
    expect(
      policy.parseArgs(['--student-no=9999', '--include-test-account']).includeTestAccount,
    ).toBe(true);
  });

  it('uses the student number as the Cognito username for direct sign-in', () => {
    expect(policy.canonicalUsername(9999)).toBe('9999');
    expect(() => policy.canonicalUsername(0)).toThrow('positive integer');
  });

  it('creates high-entropy passwords satisfying each common Cognito character group', () => {
    const passwords = new Set(Array.from({ length: 64 }, () => policy.generateTemporaryPassword()));
    expect(passwords.size).toBe(64);
    for (const password of passwords) {
      expect(password).toHaveLength(24);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%^&*_+=-]/);
    }
  });

  it('accepts either plain username sign-in or preferred_username aliases', () => {
    expect(() =>
      policy.validatePoolSupportsStudentNumberLogin({
        AliasAttributes: [],
        UsernameAttributes: [],
      }),
    ).not.toThrow();
    expect(() =>
      policy.validatePoolSupportsStudentNumberLogin({ AliasAttributes: ['preferred_username'] }),
    ).not.toThrow();
    expect(() =>
      policy.validatePoolSupportsStudentNumberLogin({
        AliasAttributes: ['email'],
        UsernameAttributes: ['email'],
      }),
    ).toThrow('plain username');
  });

  it('validates but never formats the pilot password', () => {
    expect(policy.validateTemporaryPassword('Hello00!')).toBe('Hello00!');
    expect(() => policy.validateTemporaryPassword('weak')).toThrow('at least 8');
    expect(() => policy.validateTemporaryPassword('NoSymbol123')).toThrow('symbol');
  });

  it('never formats an AWS error message that could contain request secrets', () => {
    const password = 'NeverExposeThis1!';
    const error = Object.assign(new Error(`request contained ${password}`), {
      name: 'InvalidPasswordException',
    });
    expect(policy.safeErrorName(error)).toBe('InvalidPasswordException');
    expect(policy.safeErrorName(error)).not.toContain(password);
    expect(policy.safeErrorSummary(error)).toBe('InvalidPasswordException');
    expect(policy.safeErrorSummary(new Error('A safe local validation failure.'))).toBe(
      'A safe local validation failure.',
    );
  });
});
