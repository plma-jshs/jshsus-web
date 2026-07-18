import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type DemoProfile = {
  studentNo: number;
  name: string;
  localAccountIds: string[];
};

const requireCjs = createRequire(
  `${process.cwd()}/packages/db/scripts/test-account-policy.spec.ts`,
);
const { isKnownTestProfile } = requireCjs('./test-account-policy.cjs') as {
  isKnownTestProfile: (profile: DemoProfile, requestedUsername?: string) => boolean;
};

describe('local test account identity policy', () => {
  it('recognizes the current local fixture', () => {
    expect(
      isKnownTestProfile({
        studentNo: 9999,
        name: '테스트',
        localAccountIds: ['9999'],
      }),
    ).toBe(true);
  });

  it('never treats a matching student number without a fixture login as a test fixture', () => {
    expect(
      isKnownTestProfile({
        studentNo: 9999,
        name: '테스트',
        localAccountIds: [],
      }),
    ).toBe(false);
  });

  it('never claims an unrelated user just because the requested username matches', () => {
    expect(
      isKnownTestProfile(
        {
          studentNo: 9999,
          name: '실제 학생',
          localAccountIds: ['9999'],
        },
        '9999',
      ),
    ).toBe(false);
  });
});
