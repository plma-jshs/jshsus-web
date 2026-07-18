import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type DemoProfile = {
  studentNo: number;
  name: string;
  localAccountIds: string[];
};

const requireCjs = createRequire(
  `${process.cwd()}/packages/db/scripts/demo-account-policy.spec.ts`,
);
const { isKnownDemoProfile, isKnownLegacyDemoProfile } = requireCjs(
  './demo-account-policy.cjs',
) as {
  isKnownDemoProfile: (profile: DemoProfile, requestedUsername?: string) => boolean;
  isKnownLegacyDemoProfile: (profile: DemoProfile) => boolean;
};

describe('demo account identity policy', () => {
  it('recognizes the current local fixture', () => {
    expect(
      isKnownDemoProfile({
        studentNo: 9999,
        name: '테스트',
        localAccountIds: ['9999'],
      }),
    ).toBe(true);
  });

  it('recognizes the previously shipped legacy fixture', () => {
    expect(
      isKnownLegacyDemoProfile({
        studentNo: 29999,
        name: '테스트 학생',
        localAccountIds: ['test.student'],
      }),
    ).toBe(true);
  });

  it('never treats a matching student number without a fixture login as demo data', () => {
    expect(
      isKnownDemoProfile({
        studentNo: 9999,
        name: '테스트',
        localAccountIds: [],
      }),
    ).toBe(false);
    expect(
      isKnownLegacyDemoProfile({
        studentNo: 29999,
        name: '테스트 학생',
        localAccountIds: ['real.student'],
      }),
    ).toBe(false);
  });

  it('never claims an unrelated user just because the requested username matches', () => {
    expect(
      isKnownDemoProfile(
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
