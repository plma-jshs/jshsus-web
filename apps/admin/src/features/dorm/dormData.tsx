import type { DormReportStatus, DormRoom } from '@jshsus/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/adminApi';

export const dormQueryKeys = {
  all: ['dorm'] as const,
  rooms: (query: object) => ['dorm', 'rooms', query] as const,
  students: (query: object) => ['dorm', 'students', query] as const,
  assignments: (query: object) => ['dorm', 'assignments', query] as const,
  reports: ['dorm', 'reports'] as const,
  blocks: (query: object) => ['dorm', 'roommate-blocks', query] as const,
};

export const dormReportStatusLabels: Record<DormReportStatus, string> = {
  PENDING: '접수',
  PROCESSING: '처리 중',
  COMPLETED: '완료',
};

export const dormReportStatusOptions = (
  Object.entries(dormReportStatusLabels) as Array<[DormReportStatus, string]>
).map(([value, label]) => ({ value, label }));

export type DormDataQuery = {
  year: number;
  semester: number;
  search?: string;
  dormName?: DormRoom['dormName'];
  grade?: number;
};

export function useDormData(query: DormDataQuery) {
  const term = { year: query.year, semester: query.semester };
  const roomsQuery = useQuery({
    queryKey: dormQueryKeys.rooms(query),
    queryFn: () => api.dormRooms(query),
  });
  const studentsQuery = useQuery({
    queryKey: dormQueryKeys.students(term),
    queryFn: () => api.dormStudents(term),
  });
  const assignmentsQuery = useQuery({
    queryKey: dormQueryKeys.assignments(term),
    queryFn: () => api.dormAssignments(term),
  });
  const reportsQuery = useQuery({ queryKey: dormQueryKeys.reports, queryFn: api.dormReports });
  const blocksQuery = useQuery({
    queryKey: dormQueryKeys.blocks(term),
    queryFn: () => api.dormRoommateBlocks(term),
  });

  return {
    roomsQuery,
    studentsQuery,
    assignmentsQuery,
    reportsQuery,
    blocksQuery,
    isPending:
      roomsQuery.isPending ||
      studentsQuery.isPending ||
      assignmentsQuery.isPending ||
      reportsQuery.isPending ||
      blocksQuery.isPending,
    isError:
      roomsQuery.isError ||
      studentsQuery.isError ||
      assignmentsQuery.isError ||
      reportsQuery.isError ||
      blocksQuery.isError,
  };
}

export function useRefreshDorm() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: dormQueryKeys.all });
}

export function DormReportStatusBadge({ status }: { status: DormReportStatus }) {
  return (
    <span className={`operation-status operation-status--${status.toLocaleLowerCase()}`}>
      {dormReportStatusLabels[status]}
    </span>
  );
}
