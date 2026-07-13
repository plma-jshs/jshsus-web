import type { StudentSelfStatus } from '@jshsus/types';
import { request } from '../../shared/api/http';

export function getMyStatus() {
  return request<StudentSelfStatus>('/api/me/status');
}
