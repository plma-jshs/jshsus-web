import type {
  ActivityRequestAdminListQuery,
  ActivityRequestAdminStatus,
  ActivityRequestAdminSummary,
} from '@jshsus/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/adminApi';
import { formatAdminDate } from '../../shared/lib/date';

export const activityRequestsQueryKey = ['activity-requests'] as const;

export const activityStatusLabels: Record<ActivityRequestAdminStatus, string> = {
  pending: '대기',
  approved: '승인',
  rejected: '반려',
};

export const activityStatusOptions = (
  Object.entries(activityStatusLabels) as Array<[ActivityRequestAdminStatus, string]>
).map(([value, label]) => ({ value, label }));

export function useActivityRequests(query: ActivityRequestAdminListQuery = {}) {
  return useQuery({
    queryKey: [...activityRequestsQueryKey, query],
    queryFn: () => api.activityRequests(query),
  });
}

export function useRefreshActivityRequests() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: activityRequestsQueryKey });
}

export function formatActivityDateTime(value: string) {
  return formatAdminDate(value, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

export function formatActivityDate(value: string) {
  return formatAdminDate(value, { month: '2-digit', day: '2-digit' });
}

export function ActivityStatusBadge({ status }: { status: ActivityRequestAdminStatus }) {
  return (
    <span className={`operation-status operation-status--${status}`}>
      {activityStatusLabels[status]}
    </span>
  );
}

export function activityRequestMatches(
  request: ActivityRequestAdminSummary,
  search: string,
  status: 'all' | ActivityRequestAdminStatus,
) {
  if (status !== 'all' && request.status !== status) return false;

  const keyword = search.trim().toLocaleLowerCase('ko-KR');
  if (!keyword) return true;
  return [
    request.studentNo,
    request.studentName,
    ...request.participants.flatMap((student) => [student.studentNo, student.studentName]),
    request.creatorName,
    request.advisorTeacherName,
    request.reviewerName,
    request.location,
    request.purpose,
    request.issuedNumber,
  ].some((value) =>
    String(value ?? '')
      .toLocaleLowerCase('ko-KR')
      .includes(keyword),
  );
}
