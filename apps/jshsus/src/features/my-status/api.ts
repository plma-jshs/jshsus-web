import type { StudentSelfStatus, UploadedFileSummary } from '@jshsus/types';
import { request, uploadRequest } from '../../shared/api/http';

export function getMyStatus() {
  return request<StudentSelfStatus>('/api/me/status');
}

export function updateMyProfile(nickname: string) {
  return request<{ ok: true; nickname?: string }>('/api/me/profile', {
    method: 'PATCH',
    body: { nickname },
  });
}

export function updateMyContact(
  field: 'email' | 'phone',
  value: string,
  verificationCode: string,
  currentPassword: string,
) {
  return request<{ ok: true; field: 'email' | 'phone' }>('/api/me/contact', {
    method: 'PATCH',
    body: { field, value, verificationCode, currentPassword },
  });
}

export function requestMyContactVerification(field: 'email' | 'phone', value: string) {
  return request<{ ok: true }>('/api/me/contact/verification', {
    method: 'POST',
    body: { field, value },
  });
}

export function uploadProfileImage(file: File) {
  const formData = new FormData();
  formData.set('file', file);
  return uploadRequest<{ ok: true; file: UploadedFileSummary }>('/api/files/profile', formData);
}

export function deleteProfileImage() {
  return request<{ ok: true; cleanupPending: boolean }>('/api/files/profile', {
    method: 'DELETE',
  });
}
