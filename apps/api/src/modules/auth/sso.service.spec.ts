import { describe, expect, it, vi } from 'vitest';
import { SsoService } from './sso.service';
import type { AuthSession } from './auth.service';

class MemoryRedis {
  readonly values = new Map<string, string>();

  async setJson(key: string, value: unknown) {
    this.values.set(key, JSON.stringify(value));
  }

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async take(key: string) {
    const value = this.values.get(key) ?? null;
    this.values.delete(key);
    return value;
  }

  async takeIfValue(key: string, expectedValue: string) {
    const value = this.values.get(key) ?? null;
    if (value !== expectedValue) return null;
    this.values.delete(key);
    return value;
  }
}

const centralSession: AuthSession = {
  iamId: 1,
  userId: 1,
  plmaId: 0,
  roles: ['student'],
  permissions: [],
  identifier: '9999',
  identityType: 'student',
  name: '테스트',
  persistent: false,
  isLogined: true,
};

function createFixture(session: AuthSession | null = centralSession) {
  const redis = new MemoryRedis();
  const delegated = {
    token: 'delegated-token',
    session: centralSession,
    csrfToken: 'csrf-token',
    persistent: false,
  };
  const authService = {
    getSessionFromToken: vi.fn().mockResolvedValue(session),
    issueDelegatedSession: vi.fn().mockResolvedValue(delegated),
  };
  const service = new SsoService(redis as never, authService as never);
  return { service, redis, authService, delegated };
}

describe('SsoService', () => {
  it('accepts only registered service origins and stores a safe internal return path', async () => {
    const { service, redis } = createFixture();

    await expect(service.start('https://untrusted.example', '/admin')).rejects.toMatchObject({
      status: 403,
    });

    const started = await service.start('http://localhost:5173', '//evil.example');
    expect(new URL(started.authorizationUrl).pathname).toBe('/api/auth/sso/authorize-request');
    const requestId = new URL(started.authorizationUrl).searchParams.get('sso');
    const stored = JSON.parse((await redis.get(`sso:request:${requestId}`)) ?? '{}') as {
      returnTo?: string;
      browserBindingHash?: string;
    };

    expect(stored.returnTo).toBe('/');
    expect(stored.browserBindingHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(started.browserBinding);
  });

  it('rejects backslash-based protocol-relative return paths', async () => {
    const { service, redis } = createFixture();
    const started = await service.start('http://localhost:5173', '/\\evil.example');
    const requestId = new URL(started.authorizationUrl).searchParams.get('sso');
    const stored = JSON.parse((await redis.get(`sso:request:${requestId}`)) ?? '{}') as {
      returnTo?: string;
    };

    expect(stored.returnTo).toBe('/');
  });

  it('exchanges a browser-bound code exactly once for a service-specific session', async () => {
    const { service, authService, delegated } = createFixture();
    const started = await service.start('http://localhost:5173', '/boards/free');
    const requestId = new URL(started.authorizationUrl).searchParams.get('sso') ?? '';
    const continued = await service.continue(requestId, 'central-token');
    const callback = new URL(continued.redirectUrl);
    expect(callback.pathname).toBe('/api/auth/sso/callback');
    const code = callback.searchParams.get('code') ?? '';
    const state = callback.searchParams.get('state') ?? '';

    await expect(
      service.exchange('http://localhost:5173', code, state, started.browserBinding),
    ).resolves.toEqual({ returnTo: '/boards/free', result: delegated });
    expect(authService.issueDelegatedSession).toHaveBeenCalledWith(centralSession);

    await expect(
      service.exchange('http://localhost:5173', code, state, started.browserBinding),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a code from a different browser binding or callback origin', async () => {
    const first = createFixture();
    const started = await first.service.start('http://localhost:5173', '/');
    const requestId = new URL(started.authorizationUrl).searchParams.get('sso') ?? '';
    const continued = await first.service.continue(requestId, 'central-token');
    const callback = new URL(continued.redirectUrl);

    await expect(
      first.service.exchange(
        'http://localhost:5173',
        callback.searchParams.get('code') ?? '',
        callback.searchParams.get('state') ?? '',
        'different-browser',
      ),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      first.service.exchange(
        'http://localhost:5173',
        callback.searchParams.get('code') ?? '',
        callback.searchParams.get('state') ?? '',
        started.browserBinding,
      ),
    ).resolves.toBeDefined();
  });

  it('rejects an administrator callback for a user without administrator access', async () => {
    const { service } = createFixture();
    const started = await service.start('http://localhost:5174', '/points');
    const requestId = new URL(started.authorizationUrl).searchParams.get('sso') ?? '';

    await expect(service.continue(requestId, 'central-token')).rejects.toMatchObject({
      status: 403,
    });

    await expect(service.describeRequest(requestId)).resolves.toEqual({
      client: 'admin',
      serviceName: '학생부 전산시스템',
    });
  });

  it('keeps a request available when the central session has expired', async () => {
    const { service, authService } = createFixture(null);
    const started = await service.start('http://localhost:5173', '/boards/free');
    const requestId = new URL(started.authorizationUrl).searchParams.get('sso') ?? '';

    await expect(service.continue(requestId, 'expired-token')).rejects.toMatchObject({
      status: 400,
    });
    await expect(service.describeRequest(requestId)).resolves.toEqual({
      client: 'web',
      serviceName: '과구리',
    });

    authService.getSessionFromToken.mockResolvedValueOnce(centralSession);
    await expect(service.continue(requestId, 'central-token')).resolves.toBeDefined();
  });

  it('does not grant administrator SSO access to an unknown custom permission', async () => {
    const customSession: AuthSession = {
      ...centralSession,
      permissions: ['some.unrelated.permission'],
    };
    const { service, authService } = createFixture(customSession);
    const started = await service.start('http://localhost:5174', '/points');
    const requestId = new URL(started.authorizationUrl).searchParams.get('sso') ?? '';

    await expect(service.continue(requestId, 'central-token')).rejects.toMatchObject({
      status: 403,
    });
    expect(authService.getSessionFromToken).toHaveBeenCalledWith('central-token');
  });
});
