import type {
  AccountActivationCompleteResult,
  AccountActivationIdentityType,
  AccountActivationLookupResult,
  SessionUser,
  StudentGender,
} from '@jshsus/types';
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

  if (code === 'AUTH_RECOVERY_DELIVERY_FAILED') {
    return '인증 코드 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.';
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

export type SsoConfig = {
  authOrigin: string;
  defaultServiceOrigin: string | null;
  isAuthOrigin: boolean;
  client: 'web' | 'admin' | null;
};

export function getSsoConfig() {
  return request<SsoConfig>('/api/auth/sso/config');
}

export function startSso(returnTo?: string) {
  return request<{ authorizationUrl: string }>('/api/auth/sso/start', {
    method: 'POST',
    body: { returnTo },
    csrf: false,
  });
}

export function describeSsoRequest(requestId: string) {
  return request<{ client: 'web' | 'admin'; serviceName: string }>(
    `/api/auth/sso/requests/${encodeURIComponent(requestId)}`,
  );
}

export function continueSso(requestId: string) {
  return request<{ redirectUrl: string }>('/api/auth/sso/continue', {
    method: 'POST',
    body: { requestId },
  });
}

export function exchangeSso(input: { code: string; state: string }) {
  return request<{ status: 'AUTHENTICATED'; returnTo: string }>('/api/auth/sso/exchange', {
    method: 'POST',
    body: input,
    csrf: false,
  }).then((result) => {
    clearCsrfToken();
    return result;
  });
}

export function logoutSso(returnTo: string) {
  return request<{ redirectUrl: string }>('/api/auth/sso/logout', {
    method: 'POST',
    body: { returnTo },
    csrf: false,
  }).then((result) => {
    clearCsrfToken();
    return result;
  });
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

export type PasswordResetDelivery = 'phone' | 'email';

export function requestPasswordReset(input: { username: string; delivery: PasswordResetDelivery }) {
  return request<{ ok: true }>('/api/auth/password/forgot', {
    method: 'POST',
    body: input,
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

export function completeAccountActivation(input: {
  identityType: AccountActivationIdentityType;
  identityNumber: number;
  activationCode: string;
  name: string;
  gender: StudentGender;
  email: string;
  phone: string;
  phoneVerificationCode: string;
  emailVerificationCode: string;
  password: string;
}) {
  return request<AccountActivationCompleteResult>('/api/auth/account-activation/complete', {
    method: 'POST',
    body: input,
    csrf: false,
  });
}

export function lookupAccountActivation(input: { activationCode: string }) {
  return request<AccountActivationLookupResult>('/api/auth/account-activation/lookup', {
    method: 'POST',
    body: input,
    csrf: false,
  });
}

export function requestAccountActivationPhoneVerification(input: {
  activationCode: string;
  phone: string;
}) {
  return request<{ ok: true }>('/api/auth/account-activation/phone/request', {
    method: 'POST',
    body: input,
    csrf: false,
  });
}

export function requestAccountActivationEmailVerification(input: {
  activationCode: string;
  email: string;
}) {
  return request<{ ok: true }>('/api/auth/account-activation/email/request', {
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
