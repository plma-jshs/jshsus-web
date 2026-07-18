import type {
  ActivityRequestDetail,
  ActivityRequestStudentOption,
  ActivityRequestSummary,
  ActivityRequestTeacherOption,
  ActivityTimeSlotId,
} from '@jshsus/types';
import { request } from '../../shared/api/http';

export type EditableActivityRequestDetail = ActivityRequestDetail & {
  advisorTeacherId?: number;
};

export function getMyActivityRequests() {
  return request<ActivityRequestSummary[]>('/api/activity-requests/me');
}

export function getActivityRequest(id: number) {
  return request<EditableActivityRequestDetail>(`/api/activity-requests/${id}`);
}

export function getActivityRequestStudentOptions() {
  return request<ActivityRequestStudentOption[]>('/api/activity-requests/students');
}

export function getActivityRequestTeacherOptions() {
  return request<ActivityRequestTeacherOption[]>('/api/activity-requests/teachers');
}

export function createActivityRequest(input: {
  participantStudentNos: number[];
  advisorTeacherId: number;
  location: string;
  startsAt: string;
  endsAt: string;
  activitySlotIds: ActivityTimeSlotId[];
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

export function updateActivityRequest(
  id: number,
  input: {
    participantStudentNos: number[];
    advisorTeacherId: number;
    location: string;
    startsAt: string;
    endsAt: string;
    activitySlotIds: ActivityTimeSlotId[];
    purpose: string;
  },
) {
  return request<{ ok: true; id: number; status: 'submitted' }>(`/api/activity-requests/${id}`, {
    method: 'PUT',
    body: input,
  });
}
