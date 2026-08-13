import type { Request, Response } from 'express';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { SessionGuard } from '../../shared/auth/session.guard';
import type { AccountActivationService } from './account-activation.service';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { SsoService } from './sso.service';

function controllerWithMocks() {
  const authService = {
    extractToken: vi.fn().mockReturnValue('central-session-token'),
    getSessionFromToken: vi.fn().mockResolvedValue({ userId: 10 }),
    invalidateUserSessions: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthService;
  const ssoService = {
    assertAuthOrigin: vi.fn(),
    validateLogoutTarget: vi.fn().mockReturnValue('https://service.example.test/'),
  } as unknown as SsoService;
  const controller = new AuthController(authService, {} as AccountActivationService, ssoService);

  return { authService, controller, ssoService };
}

function authRequest() {
  return {
    headers: { host: 'auth.localhost:5173' },
    hostname: 'auth.localhost',
    protocol: 'http',
  } as Request;
}

function authResponse() {
  return {
    clearCookie: vi.fn(),
    redirect: vi.fn(),
  } as unknown as Response;
}

describe('AuthController logout boundaries', () => {
  it('keeps the service-origin logout on the session and CSRF guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.logout);
    expect(guards).toEqual(expect.arrayContaining([SessionGuard, CsrfGuard]));
  });

  it('invalidates all user sessions through the protected POST logout', async () => {
    const { authService, controller } = controllerWithMocks();
    const response = authResponse();

    await expect(controller.logout(authRequest(), response)).resolves.toEqual({ ok: true });
    expect(authService.invalidateUserSessions).toHaveBeenCalledWith(10);
    expect(response.clearCookie).toHaveBeenCalledTimes(2);
  });

  it('keeps the legacy GET redirect passive', async () => {
    const { authService, controller, ssoService } = controllerWithMocks();
    const response = authResponse();

    await controller.logoutSsoAndRedirect(undefined, authRequest(), response);

    expect(ssoService.assertAuthOrigin).toHaveBeenCalledWith('http://auth.localhost:5173');
    expect(ssoService.validateLogoutTarget).toHaveBeenCalledWith(undefined);
    expect(response.redirect).toHaveBeenCalledWith(302, 'https://service.example.test/');
    expect(authService.extractToken).not.toHaveBeenCalled();
    expect(authService.getSessionFromToken).not.toHaveBeenCalled();
    expect(authService.invalidateUserSessions).not.toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
    expect(response.clearCookie).not.toHaveBeenCalled();
  });
});
