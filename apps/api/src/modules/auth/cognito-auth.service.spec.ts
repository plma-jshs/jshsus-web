import { afterEach, describe, expect, it, vi } from 'vitest';
import { CognitoAuthService, createCognitoSecretHash } from './cognito-auth.service';
import { assertTrustedCredentialRequest, inferCognitoSurface } from './auth.controller';

describe('createCognitoSecretHash', () => {
  it('matches the Cognito SECRET_HASH HMAC contract', () => {
    expect(createCognitoSecretHash('9999', 'client-id', 'client-secret')).toBe(
      'c99cZv0J5cD6udBr/CdSk7PlOSNiC8ZRDPzgofCrgFM=',
    );
  });
});

describe('CognitoAuthService challenges', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('carries supported required attributes into the new-password challenge flow', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ChallengeName: 'NEW_PASSWORD_REQUIRED',
            Session: 'challenge-session',
            ChallengeParameters: {
              USER_ID_FOR_SRP: 'canonical-user',
              requiredAttributes: '["userAttributes.email"]',
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      new CognitoAuthService().authenticate('9999', 'temporary-password', 'web'),
    ).resolves.toMatchObject({
      kind: 'new-password-required',
      requiredAttributes: ['userAttributes.email'],
      username: 'canonical-user',
    });
  });

  it('stops when Cognito requires account attributes the app cannot supply', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ChallengeName: 'NEW_PASSWORD_REQUIRED',
            Session: 'challenge-session',
            ChallengeParameters: {
              USER_ID_FOR_SRP: 'canonical-user',
              requiredAttributes: '["userAttributes.phone_number"]',
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      new CognitoAuthService().authenticate('9999', 'temporary-password', 'web'),
    ).rejects.toMatchObject({ code: 'AUTH_ACCOUNT_ATTRIBUTES_REQUIRED' });
  });

  it("uses Cognito's canonical SRP username for a new-password challenge", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ChallengeName: 'NEW_PASSWORD_REQUIRED',
            Session: 'challenge-session',
            ChallengeParameters: {
              USER_ID_FOR_SRP: 'canonical-user',
              USERNAME: 'login-alias',
              requiredAttributes: '[]',
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      new CognitoAuthService().authenticate('9999', 'temporary-password', 'admin'),
    ).resolves.toMatchObject({
      kind: 'new-password-required',
      requiredAttributes: [],
      username: 'canonical-user',
    });
  });

  it('sends supported required attributes when completing a new-password challenge', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ AuthenticationResult: { AccessToken: 'temporary-access-token' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            Username: 'canonical-user',
            UserAttributes: [{ Name: 'sub', Value: 'cognito-subject' }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new CognitoAuthService().completeNewPassword({
        username: 'canonical-user',
        newPassword: 'NewPassword1!',
        requiredAttributeValues: { 'userAttributes.email': '9999@jshsus.kr' },
        session: 'challenge-session',
        surface: 'web',
      }),
    ).resolves.toMatchObject({ subject: 'cognito-subject' });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.ChallengeResponses).toMatchObject({
      'userAttributes.email': '9999@jshsus.kr',
    });
  });

  it('requires a fresh login when GetUser fails after the password challenge succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ AuthenticationResult: { AccessToken: 'temporary-access-token' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ __type: 'TooManyRequestsException' }), { status: 400 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new CognitoAuthService().completeNewPassword({
        username: 'canonical-user',
        newPassword: 'NewPassword1!',
        session: 'challenge-session',
        surface: 'web',
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_PASSWORD_CHANGED_RELOGIN_REQUIRED',
      causeName: 'TooManyRequestsException',
    });
  });
});

describe('inferCognitoSurface', () => {
  it('uses the admin client for the admin development origin', () => {
    expect(
      inferCognitoSurface({
        hostname: 'localhost',
        headers: { origin: 'http://localhost:5174' },
      } as never),
    ).toBe('admin');
  });

  it('uses the web client for the public staging origin', () => {
    expect(
      inferCognitoSurface({
        hostname: 'api',
        headers: { origin: 'https://v26.jshsus.kr' },
      } as never),
    ).toBe('web');
  });

  it('falls back to the admin request host behind nginx', () => {
    expect(
      inferCognitoSurface({
        hostname: 'admin-v26.jshsus.kr',
        headers: {},
      } as never),
    ).toBe('admin');
  });

  it('uses the trusted browser origin before a proxy host fallback', () => {
    expect(
      inferCognitoSurface({
        hostname: 'admin-v26.jshsus.kr',
        headers: {
          origin: 'https://v26.jshsus.kr',
          host: 'admin-v26.jshsus.kr',
        },
      } as never),
    ).toBe('web');
  });
});

describe('credential request boundary', () => {
  it('accepts JSON requests from an explicitly allowed origin', () => {
    expect(() =>
      assertTrustedCredentialRequest({
        headers: {
          'content-type': 'application/json; charset=utf-8',
          origin: 'http://localhost:5173',
          'sec-fetch-site': 'same-site',
        },
      } as never),
    ).not.toThrow();
  });

  it('rejects cross-site credential requests even when they use JSON', () => {
    expect(() =>
      assertTrustedCredentialRequest({
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5173',
          'sec-fetch-site': 'cross-site',
        },
      } as never),
    ).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it('rejects form posts so a third-party page cannot submit login credentials', () => {
    expect(() =>
      assertTrustedCredentialRequest({
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      } as never),
    ).toThrowError(expect.objectContaining({ status: 415 }));
  });
});
