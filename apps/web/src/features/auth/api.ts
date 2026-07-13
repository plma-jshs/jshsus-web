import type { SessionUser } from '@jshsus/types';
import { clearCsrfToken, request } from '../../shared/api/http';

export function getSession() {
  return request<SessionUser>('/api/auth/session');
}

export function login(input: { username: string; password: string; remember: boolean }) {
  return request<Extract<SessionUser, { isLogined: true }>>('/api/auth/login', {
    method: 'POST',
    body: input,
    csrf: false,
  }).then((session) => {
    clearCsrfToken();
    return session;
  });
}

export function logout() {
  return request<{ ok: true }>('/api/auth/logout', { method: 'POST' }).then((result) => {
    clearCsrfToken();
    return result;
  });
}
