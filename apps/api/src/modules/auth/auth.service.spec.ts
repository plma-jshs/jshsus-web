import { describe, expect, it } from 'vitest';
import { resolveSessionIdentity } from './auth.service';

describe('resolveSessionIdentity', () => {
  it('uses the student profile number for display and legacy stuid compatibility', () => {
    expect(
      resolveSessionIdentity({
        studentNo: 9999,
        legacyStudentNo: 29999,
        providerAccountId: 'test',
        username: 'test',
      }),
    ).toEqual({ identifier: '9999', identityType: 'student', stuid: 9999 });
  });

  it('uses the site-issued teacher number without exposing it as stuid', () => {
    expect(
      resolveSessionIdentity({
        staffNo: 100123,
        legacyStudentNo: 100123,
        providerAccountId: '100123',
        username: '100123',
      }),
    ).toEqual({ identifier: '100123', identityType: 'staff' });
  });

  it('falls back to the provider account id for non-profile local accounts', () => {
    expect(
      resolveSessionIdentity({ providerAccountId: 'local-admin', username: 'ignored' }),
    ).toEqual({ identifier: 'local-admin', identityType: 'local' });
  });
});
