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

  it('routes password recovery through Cognito while hiding unknown accounts', async () => {
    const cognito = {
      forgotPassword: vi
        .fn()
        .mockRejectedValue(new CognitoAuthError('AUTH_INVALID_CREDENTIALS', 'invalid credentials')),
    };
    const service = new AuthService(
      { incrementWithTtl: vi.fn().mockResolvedValue(1) } as never,
      {} as never,
      cognito as never,
    );

    await expect(service.requestPasswordReset('9999', 'web')).resolves.toEqual({ ok: true });
    expect(cognito.forgotPassword).toHaveBeenCalledWith('9999', 'web');
  });

  it('maps Cognito reset-confirm credential failures to the public invalid-code response', async () => {
    const cognito = {
      confirmForgotPassword: vi
        .fn()
        .mockRejectedValue(new CognitoAuthError('AUTH_INVALID_CREDENTIALS', 'invalid credentials')),
    };
    const service = new AuthService(
      { incrementWithTtl: vi.fn().mockResolvedValue(1) } as never,
      {} as never,
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
    expect(cognito.confirmForgotPassword).toHaveBeenCalledOnce();
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
