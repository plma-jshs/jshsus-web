import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, ClipboardCheck, Smartphone } from 'lucide-react';
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

  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <div className="panel-title">
          <div className="panel-title-copy">
            <h2>오늘 운영 상태</h2>
            <p>오늘 확인해야 할 학교생활 운영 지표입니다.</p>
          </div>
        </div>
        <div className="metric-grid dashboard-today-grid">
          <article className="metric-card">
            <CalendarCheck2 size={20} />
            <span>오늘 승인된 탐구활동서</span>
            <strong>{data.today.approvedActivityRequests}건</strong>
          </article>
          <article className="metric-card">
            <ClipboardCheck size={20} />
            <span>탐구활동서 승인 대기</span>
            <strong>{data.today.pendingActivityRequests}건</strong>
          </article>
          <article className="metric-card">
            <Smartphone size={20} />
            <span>휴대폰 보관함 연결</span>
            <strong>
              {data.today.connectedDeviceCases}/{data.today.totalDeviceCases}대
            </strong>
            <small>
              {data.today.disconnectedDeviceCases > 0
                ? `미연결 ${data.today.disconnectedDeviceCases}대`
                : '모두 연결됨'}
            </small>
          </article>
        </div>
      </section>
    </div>
  );
}
