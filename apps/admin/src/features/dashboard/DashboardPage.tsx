import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ClipboardCheck, Smartphone } from 'lucide-react';
import { api, describeAdminApiError } from '../../shared/api/adminApi';

export function DashboardPage() {
  const dashboardQuery = useQuery({ queryKey: ['admin-dashboard'], queryFn: api.dashboard });

  if (dashboardQuery.isLoading) {
    return <section className="admin-panel">관리자 대시보드를 불러오는 중입니다.</section>;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <section className="admin-panel error">
        {describeAdminApiError(dashboardQuery.error, '관리자 대시보드')}
      </section>
    );
  }

  const data = dashboardQuery.data;
  const disconnectedCases = data.deviceCases.filter((deviceCase) => !deviceCase.isConnected).length;

  return (
    <div className="admin-stack">
      <section className="metric-grid">
        <article className="metric-card">
          <BadgeCheck size={20} />
          <span>상벌점 주의 대상</span>
          <strong>{data.pointSummary.watchListCount}명</strong>
        </article>
        <article className="metric-card">
          <Smartphone size={20} />
          <span>보관함 연결 이상</span>
          <strong>{disconnectedCases}대</strong>
        </article>
        <article className="metric-card">
          <ClipboardCheck size={20} />
          <span>탐구활동서 승인 대기</span>
          <strong>{data.pendingActivityRequests.length}건</strong>
        </article>
      </section>
    </div>
  );
}
