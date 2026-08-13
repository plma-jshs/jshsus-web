import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const requireCjs = createRequire(
  `${process.cwd()}/packages/db/scripts/bootstrap-core-data.spec.ts`,
);
const { shouldIncludeLegacyContent } = requireCjs('./bootstrap-core-data.cjs') as {
  shouldIncludeLegacyContent: (environment?: Record<string, string | undefined>) => boolean;
};

describe('core bootstrap legacy content policy', () => {
  it('does not load legacy content by default', () => {
    expect(shouldIncludeLegacyContent({})).toBe(false);
  });

  it('requires an explicit lowercase true opt-in', () => {
    expect(shouldIncludeLegacyContent({ BOOTSTRAP_LEGACY_CONTENT: 'true' })).toBe(true);
    expect(shouldIncludeLegacyContent({ BOOTSTRAP_LEGACY_CONTENT: 'false' })).toBe(false);
    expect(shouldIncludeLegacyContent({ BOOTSTRAP_LEGACY_CONTENT: 'TRUE' })).toBe(false);
  });
});
