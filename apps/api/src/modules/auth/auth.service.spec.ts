import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService, resolveSessionIdentity } from './auth.service';
import { CognitoAuthError } from './cognito-auth.service';

describe('resolveSessionIdentity', () => {
  it('uses the student profile number for display and stuid compatibility', () => {
    expect(
      resolveSessionIdentity({
        studentNo: 9999,
        providerAccountId: 'test',
        username: 'test',
      }),
    ).toEqual({ identifier: '9999', identityType: 'student', stuid: 9999 });
  });

  it('uses the site-issued teacher number without exposing it as stuid', () => {
    expect(
      resolveSessionIdentity({
        staffNo: 100123,
        providerAccountId: '100123',
        username: '100123',
      }),
    ).toEqual({ identifier: '100123', identityType: 'staff' });
  });

  it('falls back to the provider account id when no profile number exists', () => {
    expect(
      resolveSessionIdentity({ providerAccountId: 'local-admin', username: 'ignored' }),
    ).toEqual({ identifier: 'local-admin', identityType: 'local' });
  });
});

describe('Cognito authentication routing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes password login through Cognito only', async () => {
    const cognito = {
      authenticate: vi
        .fn()
        .mockRejectedValue(new CognitoAuthError('AUTH_INVALID_CREDENTIALS', 'invalid credentials')),
    };
    const service = new AuthService(
      { incrementWithTtl: vi.fn().mockResolvedValue(1) } as never,
      {} as never,
      cognito as never,
    );

    await expect(
      service.login({
        username: '9999',
        password: 'wrong',
        remember: false,
        surface: 'web',
      }),
    ).rejects.toMatchObject({ status: 401 });

    expect(cognito.authenticate).toHaveBeenCalledWith('9999', 'wrong', 'web');
  });

  it('hides unknown password recovery accounts without sending a code', async () => {
    const sendon = { sendPasswordResetCode: vi.fn() };
    const service = new AuthService(
      { incrementWithTtl: vi.fn().mockResolvedValue(1) } as never,
      { writeAudit: vi.fn() } as never,
      {} as never,
      sendon as never,
    );
    vi.spyOn(
      service as unknown as { findPasswordResetTarget: () => Promise<unknown> },
      'findPasswordResetTarget',
    ).mockResolvedValue(null);

    await expect(service.requestPasswordReset('9999', 'web')).resolves.toEqual({ ok: true });
    expect(sendon.sendPasswordResetCode).not.toHaveBeenCalled();
  });

  it('stores a reset challenge and sends the code through Sendon for linked accounts', async () => {
    const redis = {
      incrementWithTtl: vi.fn().mockResolvedValue(1),
      setJson: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const sendon = { sendPasswordResetCode: vi.fn().mockResolvedValue(undefined) };
    const service = new AuthService(
      redis as never,
      { writeAudit: vi.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      sendon as never,
    );
    vi.spyOn(
      service as unknown as { findPasswordResetTarget: () => Promise<unknown> },
      'findPasswordResetTarget',
    ).mockResolvedValue({
      userId: 1,
      username: '9999',
      phone: '01012345678',
      status: 'active',
      cognitoSubject: 'sub-1',
    });

    await expect(service.requestPasswordReset('9999', 'web')).resolves.toEqual({ ok: true });
    expect(redis.setJson).toHaveBeenCalledOnce();
    expect(sendon.sendPasswordResetCode).toHaveBeenCalledWith({
      phone: '01012345678',
      code: expect.stringMatching(/^\d{6}$/),
    });
  });

  it('rejects invalid password reset codes before changing the Cognito password', async () => {
    const redis = {
      incrementWithTtl: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          username: '9999',
          userId: 1,
          codeHash: '0'.repeat(64),
          attemptCount: 0,
        }),
      ),
      setJson: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const cognito = { setPermanentPassword: vi.fn() };
    const service = new AuthService(
      redis as never,
      { writeAudit: vi.fn() } as never,
      cognito as never,
    );

    await expect(
      service.confirmPasswordReset({
        username: '9999',
        code: '123456',
        newPassword: 'NewPassword1!',
        surface: 'web',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'AUTH_CODE_MISMATCH' },
    });
    expect(cognito.setPermanentPassword).not.toHaveBeenCalled();
  });

  it('changes the Cognito password after a valid Sendon reset code', async () => {
    const redis = {
      incrementWithTtl: vi.fn().mockResolvedValue(1),
      get: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      setMembers: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue(undefined),
    };
    const cognito = { setPermanentPassword: vi.fn().mockResolvedValue(undefined) };
    const service = new AuthService(
      redis as never,
      { writeAudit: vi.fn().mockResolvedValue(undefined) } as never,
      cognito as never,
    );
    const internal = service as unknown as {
      hashPasswordResetCode: (username: string, code: string) => string;
    };
    redis.get.mockResolvedValue(
      JSON.stringify({
        username: '9999',
        userId: 1,
        codeHash: internal.hashPasswordResetCode('9999', '123456'),
        attemptCount: 0,
      }),
    );

    await expect(
      service.confirmPasswordReset({
        username: '9999',
        code: '123456',
        newPassword: 'NewPassword1!',
        surface: 'web',
      }),
    ).resolves.toEqual({ ok: true });
    expect(cognito.setPermanentPassword).toHaveBeenCalledWith('9999', 'NewPassword1!');
  });

  it('does not allow a web challenge flow to be completed through the admin surface', async () => {
    const cognito = { completeNewPassword: vi.fn() };
    const service = new AuthService(
      {
        take: vi.fn().mockResolvedValue(
          JSON.stringify({
            username: '9999',
            session: 'cognito-session',
            surface: 'web',
            remember: false,
          }),
        ),
      } as never,
      {} as never,
      cognito as never,
    );

    await expect(
      service.completeNewPassword('a68b1ca2-cc56-4ce2-8e35-39d290ba57ad', 'NewPassword1!', 'admin'),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'AUTH_FLOW_EXPIRED' },
    });
    expect(cognito.completeNewPassword).not.toHaveBeenCalled();
  });

  it('does not mask an account-link failure after Cognito changes the password', async () => {
    const cognito = {
      completeNewPassword: vi.fn().mockResolvedValue({
        kind: 'authenticated',
        subject: 'sub-1',
        username: 'canonical-user',
      }),
    };
    const service = new AuthService(
      {
        take: vi.fn().mockResolvedValue(
          JSON.stringify({
            username: 'canonical-user',
            session: 'cognito-session',
            surface: 'web',
            remember: false,
          }),
        ),
      } as never,
      {} as never,
      cognito as never,
    );
    const internal = service as unknown as {
      createCognitoSession: (...args: unknown[]) => Promise<unknown>;
    };
    vi.spyOn(internal, 'createCognitoSession').mockRejectedValue(
      new UnauthorizedException({
        code: 'AUTH_ACCOUNT_NOT_LINKED',
        message: 'account is not linked',
      }),
    );

    await expect(
      service.completeNewPassword('a68b1ca2-cc56-4ce2-8e35-39d290ba57ad', 'NewPassword1!', 'web'),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_ACCOUNT_NOT_LINKED' },
    });
  });

  it('expires a consumed challenge instead of restoring an invalid Cognito session', async () => {
    const redis = {
      take: vi.fn().mockResolvedValue(
        JSON.stringify({
          username: 'canonical-user',
          session: 'invalid-session',
          surface: 'web',
          remember: false,
        }),
      ),
      setJson: vi.fn(),
    };
    const service = new AuthService(
      redis as never,
      {} as never,
      {
        completeNewPassword: vi
          .fn()
          .mockRejectedValue(
            new CognitoAuthError(
              'AUTH_INVALID_PASSWORD',
              'invalid challenge input',
              'InvalidParameterException',
            ),
          ),
      } as never,
    );

    await expect(
      service.completeNewPassword('a68b1ca2-cc56-4ce2-8e35-39d290ba57ad', 'NewPassword1!', 'web'),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'AUTH_FLOW_EXPIRED' },
    });
    expect(redis.setJson).not.toHaveBeenCalled();
  });

  it('blocks a Cognito-only session when one user has multiple Cognito links', async () => {
    const service = new AuthService({} as never, {} as never, {} as never);
    const internal = service as unknown as {
      findCognitoAccountBySubject: (subject: string) => Promise<unknown>;
      findCognitoLinkForUser: (userId: number) => Promise<{ subject: string } | null>;
      createCognitoSession: (input: {
        subject: string;
        username: string;
        remember: boolean;
      }) => Promise<unknown>;
    };
    vi.spyOn(internal, 'findCognitoAccountBySubject').mockResolvedValue({
      userId: 1,
      status: 'active',
    });
    vi.spyOn(internal, 'findCognitoLinkForUser').mockResolvedValue({ subject: 'different-sub' });

    await expect(
      internal.createCognitoSession({
        subject: 'sub-1',
        username: 'canonical-user',
        remember: false,
      }),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: 'AUTH_ACCOUNT_LINK_CONFLICT' },
    });
  });
});
