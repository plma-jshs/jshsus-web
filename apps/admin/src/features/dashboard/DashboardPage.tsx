import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, BadgeCheck, ClipboardCheck, Smartphone } from 'lucide-react';
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

      <section className="admin-panel">
        <div className="panel-title">
          <div className="panel-title-copy">
            <AlertTriangle size={18} />
            <div>
              <h2>처리가 필요한 작업</h2>
            </div>
          </div>
        </div>
        <div className="queue-list">
          {data.pendingActivityRequests.map((request) => (
            <article key={request.id} className="queue-row">
              <div>
                <strong>{request.studentName}</strong>
                <span>
                  {request.location} · {request.purpose}
                </span>
              </div>
              <Link to="/activity-requests" className="table-link">
                승인 검토
              </Link>
            </article>
          ))}
          {data.deviceCases
            .filter((deviceCase) => !deviceCase.isConnected)
            .map((deviceCase) => (
              <article key={deviceCase.id} className="queue-row">
                <div>
                  <strong>보관함 {deviceCase.id} 연결 확인</strong>
                </div>
                <Link to="/device-cases" className="table-link">
                  보관함 확인
                </Link>
              </article>
            ))}
          {data.pendingActivityRequests.length === 0 && disconnectedCases === 0 ? (
            <p className="empty-text compact-empty">지금 처리할 작업이 없습니다.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
