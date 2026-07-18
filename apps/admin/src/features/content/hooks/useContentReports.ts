import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContentReportSummary } from '@jshsus/types';
import { useToast } from '../../../components/ui';
import { api } from '../../../shared/api/adminApi';

export function useContentReports(targetTypes: readonly ContentReportSummary['targetType'][]) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const reportsQuery = useQuery({
    queryKey: ['admin-reports'],
    queryFn: api.reports,
  });
  const updateReportMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.updateReportStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
      showToast({ title: '신고 처리 상태를 저장했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '신고 처리 상태를 저장하지 못했습니다.', tone: 'danger' }),
  });

  const reports = useMemo(
    () => (reportsQuery.data ?? []).filter((report) => targetTypes.includes(report.targetType)),
    [reportsQuery.data, targetTypes],
  );

  return {
    reports,
    reportsQuery,
    updateReportMutation,
  };
}
