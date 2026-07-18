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
