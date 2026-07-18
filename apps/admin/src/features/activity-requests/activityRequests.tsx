import type {
  ActivityRequestAdminListQuery,
  ActivityRequestAdminStatus,
  ActivityRequestAdminSummary,
} from '@jshsus/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/adminApi';

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

function activityDateParts(value: string, includeTime: boolean) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? ({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const) : {}),
  }).formatToParts(new Date(value));
  return new Map(parts.map((part) => [part.type, part.value]));
}

export function formatActivityDateTime(value: string) {
  const parts = activityDateParts(value, true);
  return `${parts.get('year')}. ${parts.get('month')}. ${parts.get('day')} ${parts.get('hour')}:${parts.get('minute')}`;
}

export function formatActivityDate(value: string) {
  const parts = activityDateParts(value, false);
  return `${parts.get('year')}. ${parts.get('month')}. ${parts.get('day')}`;
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
