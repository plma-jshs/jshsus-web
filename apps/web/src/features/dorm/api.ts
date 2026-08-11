import type { DormSelfView } from '@jshsus/types';
import { request } from '../../shared/api/http';

export function getMyDorm() {
  return request<DormSelfView>('/api/dorm/me');
}

export function createDormReport(description: string) {
  return request<{ ok: true; id: number }>('/api/dorm/reports', {
    method: 'POST',
    body: { description },
  });
}
