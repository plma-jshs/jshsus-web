import type { ActivityRequestDetail, ActivityRequestSummary } from '@jshsus/types';
import { request } from '../../shared/api/http';

export function getMyActivityRequests() {
  return request<ActivityRequestSummary[]>('/api/activity-requests/me');
}

export function getActivityRequest(id: number) {
  return request<ActivityRequestDetail>(`/api/activity-requests/${id}`);
}

export function createActivityRequest(input: {
  location: string;
  startsAt: string;
  endsAt: string;
  purpose: string;
}) {
  return request<{ ok: true; request: { id: number; status: 'submitted' } }>(
    '/api/activity-requests',
    { method: 'POST', body: input },
  );
}

export function cancelActivityRequest(id: number) {
  return request<{ ok: true; id: number; status: 'canceled' }>(
    `/api/activity-requests/${id}/cancel`,
    { method: 'POST' },
  );
}
