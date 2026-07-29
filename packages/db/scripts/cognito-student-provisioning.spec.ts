import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const requireCjs = createRequire(
  `${process.cwd()}/packages/db/scripts/cognito-student-provisioning.spec.ts`,
);
const policy = requireCjs('./cognito-student-provisioning.cjs') as {
  canonicalUsername: (studentNo: number) => string;
  generateTemporaryPassword: (length?: number) => string;
  isLegacyBridgeCandidate: (candidate: { studentNo: number; name?: string }) => boolean;
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
  validateCognitoUser: (
    user: {
      Username?: string;
      UserAttributes?: Array<{ Name?: string; Value?: string }>;
    },
    candidate: { studentNo: number; username: string },
  ) => string;
  validatePoolSupportsStudentNumberLogin: (pool: {
    AliasAttributes?: string[];
    SchemaAttributes?: Array<{
      AttributeDataType?: string;
      Mutable?: boolean;
      Name: string;
    }>;
    UsernameAttributes?: string[];
  }) => void;
  validateTemporaryPassword: (password: string | undefined) => string;
};
const provisioner = requireCjs('./provision-cognito-students.cjs') as {
  enrollmentActiveClause: (columns: Set<string>) => string;
  normalizeCandidates: (
    rows: Array<{ email?: string | null; name: string; studentNo: number; userId: number }>,
    options: { includeTestAccount: boolean; studentNo: number | null },
  ) => {
    candidates: Array<{ studentNo: number; username: string }>;
    excludedLegacyBridges: Array<{ studentNo: number }>;
  };
  readConfig: (
    environment: Record<string, string | undefined>,
    options: {
      apply: boolean;
      confirmPoolId: string | null;
      ensureTestAccount: boolean;
      studentNo: number | null;
      temporaryPasswordEnv: string | null;
    },
  ) => { temporaryPassword: string | null };
  supportsCurrentEnrollmentSource: (metadata: {
    columns: Map<string, Set<string>>;
    tables: Set<string>;
  }) => boolean;
  validateCandidateAttributesForPool: (
    pool: { SchemaAttributes?: Array<{ Name?: string; Required?: boolean }> },
    candidates: Array<{ email: string | null }>,
  ) => void;
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

  it('always rejects retired legacy bridge identities', () => {
    expect(() => policy.parseArgs(['--student-no', '9988'])).toThrow('retired legacy bridge');
    expect(policy.isLegacyBridgeCandidate({ studentNo: 9988, name: 'legacy' })).toBe(true);
    expect(policy.isLegacyBridgeCandidate({ studentNo: 2201, name: '강재환' })).toBe(true);
    expect(policy.isLegacyBridgeCandidate({ studentNo: 2201, name: '정상 학생' })).toBe(false);
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
        SchemaAttributes: [
          { AttributeDataType: 'String', Mutable: true, Name: 'custom:studentNo' },
        ],
        UsernameAttributes: [],
      }),
    ).not.toThrow();
    expect(() =>
      policy.validatePoolSupportsStudentNumberLogin({
        AliasAttributes: ['preferred_username'],
        SchemaAttributes: [
          { AttributeDataType: 'String', Mutable: true, Name: 'custom:studentNo' },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      policy.validatePoolSupportsStudentNumberLogin({
        AliasAttributes: ['email'],
        SchemaAttributes: [
          { AttributeDataType: 'String', Mutable: true, Name: 'custom:studentNo' },
        ],
        UsernameAttributes: ['email'],
      }),
    ).toThrow('plain username');
    expect(() =>
      policy.validatePoolSupportsStudentNumberLogin({
        AliasAttributes: [],
        SchemaAttributes: [],
        UsernameAttributes: [],
      }),
    ).toThrow('custom:studentNo');
  });

  it('requires the immutable sub and managed student number on Cognito users', () => {
    const candidate = { studentNo: 2201, username: '2201' };
    expect(
      policy.validateCognitoUser(
        {
          Username: '2201',
          UserAttributes: [
            { Name: 'sub', Value: 'cognito-sub' },
            { Name: 'custom:studentNo', Value: '2201' },
          ],
        },
        candidate,
      ),
    ).toBe('cognito-sub');
    expect(() =>
      policy.validateCognitoUser(
        {
          Username: '2201',
          UserAttributes: [{ Name: 'sub', Value: 'cognito-sub' }],
        },
        candidate,
      ),
    ).toThrow('custom:studentNo');
  });

  it('uses enrollment status whenever the current enrollment schema is available', () => {
    const metadata = {
      columns: new Map([
        ['users', new Set(['id'])],
        ['students', new Set(['user_id'])],
        ['student_enrollments', new Set(['student_id', 'student_no'])],
        ['school_years', new Set(['year', 'is_active'])],
      ]),
      tables: new Set(['users', 'students', 'student_enrollments', 'school_years']),
    };
    expect(provisioner.supportsCurrentEnrollmentSource(metadata)).toBe(true);
    metadata.columns.get('student_enrollments')?.delete('student_no');
    expect(provisioner.supportsCurrentEnrollmentSource(metadata)).toBe(false);
  });

  it('filters active enrollments using the deployed v26 status column', () => {
    expect(provisioner.enrollmentActiveClause(new Set(['student_enrollment_status']))).toBe(
      "AND se.`student_enrollment_status` = 'active'",
    );
    expect(provisioner.enrollmentActiveClause(new Set(['status']))).toBe(
      "AND se.`status` = 'active'",
    );
  });

  it('rejects a required-email pool when roster candidates have no email yet', () => {
    expect(() =>
      provisioner.validateCandidateAttributesForPool(
        { SchemaAttributes: [{ Name: 'email', Required: true }] },
        [{ email: null }],
      ),
    ).toThrow('requires email');
    expect(() =>
      provisioner.validateCandidateAttributesForPool(
        { SchemaAttributes: [{ Name: 'email', Required: false }] },
        [{ email: null }],
      ),
    ).not.toThrow();
  });

  it('allows idempotent bulk apply without distributing shared temporary passwords', () => {
    expect(
      provisioner.readConfig(
        {
          AWS_REGION: 'ap-northeast-2',
          COGNITO_USER_POOL_ID: 'ap-northeast-2_example',
          DATABASE_URL: 'mysql://provisioner@example.invalid/db',
        },
        {
          apply: true,
          confirmPoolId: 'ap-northeast-2_example',
          ensureTestAccount: false,
          studentNo: null,
          temporaryPasswordEnv: null,
        },
      ).temporaryPassword,
    ).toBeNull();
  });

  it('excludes production test and legacy bridge candidates from normal bulk runs', () => {
    const result = provisioner.normalizeCandidates(
      [
        { name: '정상 학생', studentNo: 1101, userId: 1 },
        { name: '테스트', studentNo: 9999, userId: 2 },
        { name: '강재환', studentNo: 2201, userId: 3 },
        { name: 'legacy', studentNo: 9988, userId: 4 },
      ],
      { includeTestAccount: false, studentNo: null },
    );
    expect(result.candidates).toEqual([
      { email: null, name: '정상 학생', studentNo: 1101, userId: 1, username: '1101' },
    ]);
    expect(result.excludedLegacyBridges.map((candidate) => candidate.studentNo)).toEqual([
      2201, 9988,
    ]);
  });

  it('includes 9999 only when the explicit test option is present', () => {
    const rows = [{ name: '테스트', studentNo: 9999, userId: 2 }];
    expect(
      provisioner.normalizeCandidates(rows, {
        includeTestAccount: false,
        studentNo: null,
      }).candidates,
    ).toEqual([]);
    expect(
      provisioner.normalizeCandidates(rows, {
        includeTestAccount: true,
        studentNo: null,
      }).candidates,
    ).toEqual([
      {
        email: null,
        name: '테스트',
        studentNo: 9999,
        userId: 2,
        username: '9999',
      },
    ]);
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
