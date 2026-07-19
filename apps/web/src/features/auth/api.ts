import type { SessionUser } from '@jshsus/types';
import { ApiError, clearCsrfToken, request } from '../../shared/api/http';

export type AuthenticatedLoginResult = {
  status: 'AUTHENTICATED';
  session: Extract<SessionUser, { isLogined: true }>;
};

export type LoginResult =
  AuthenticatedLoginResult | { status: 'NEW_PASSWORD_REQUIRED'; flowId: string };

export function getAuthErrorCode(error: unknown): string | undefined {
  if (!(error instanceof ApiError) || !error.payload || typeof error.payload !== 'object') {
    return undefined;
  }

  const code = (error.payload as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return fallback;
  }

  if (error.status === 401) {
    return fallback;
  }

  const code = getAuthErrorCode(error);
  if (
    code === 'AUTH_ACCOUNT_ATTRIBUTES_REQUIRED' ||
    code === 'AUTH_ACCOUNT_ROLE_REQUIRED' ||
    code === 'AUTH_ROLE_REQUIRED' ||
    code === 'AUTH_ACCOUNT_NOT_LINKED' ||
    code === 'AUTH_ACCOUNT_LINK_MISMATCH' ||
    code === 'AUTH_ACCOUNT_LINK_CONFLICT'
  ) {
    return '통합로그인 계정 정보에 문제가 있습니다. 학교 담당자에게 문의해 주세요.';
  }

  if (code === 'AUTH_PASSWORD_RESET_UNAVAILABLE' || code === 'AUTH_RECOVERY_UNAVAILABLE') {
    return '이 계정의 비밀번호 재설정은 학교 담당자에게 문의해 주세요.';
  }

  if (!error.payload || typeof error.payload !== 'object') {
    return fallback;
  }

  const message = (error.payload as { message?: unknown }).message;
  return typeof message === 'string' ? message : fallback;
}

export function getSession() {
  return request<SessionUser>('/api/auth/session');
}

export function login(input: { username: string; password: string; remember: boolean }) {
  return request<LoginResult>('/api/auth/login', {
    method: 'POST',
    body: input,
    csrf: false,
  }).then((result) => {
    clearCsrfToken();
    return result;
  });
}

export function completeNewPassword(input: { flowId: string; newPassword: string }) {
  return request<AuthenticatedLoginResult>('/api/auth/challenges/new-password', {
    method: 'POST',
    body: input,
    csrf: false,
  }).then((result) => {
    clearCsrfToken();
    return result;
  });
}

export function requestPasswordReset(username: string) {
  return request<{ ok: true }>('/api/auth/password/forgot', {
    method: 'POST',
    body: { username },
    csrf: false,
  });
}

export function confirmPasswordReset(input: {
  username: string;
  code: string;
  newPassword: string;
}) {
  return request<{ ok: true }>('/api/auth/password/confirm', {
    method: 'POST',
    body: input,
    csrf: false,
  });
}

export function logout() {
  return request<{ ok: true }>('/api/auth/logout', { method: 'POST' }).then((result) => {
    clearCsrfToken();
    return result;
  });
}
