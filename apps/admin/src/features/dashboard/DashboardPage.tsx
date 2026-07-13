import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, BedDouble, ClipboardCheck, Smartphone } from 'lucide-react';
import { api } from '../../shared/api/adminApi';

export function DashboardPage() {
  const dashboardQuery = useQuery({ queryKey: ['admin-dashboard'], queryFn: api.dashboard });

  if (dashboardQuery.isLoading) {
    return <section className="admin-panel">관리자 대시보드를 불러오는 중입니다.</section>;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return <section className="admin-panel error">관리자 API 연결을 확인해주세요.</section>;
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
          <BedDouble size={20} />
          <span>기숙사 방</span>
          <strong>{data.dormRooms.length}개</strong>
        </article>
        <article className="metric-card">
          <ClipboardCheck size={20} />
          <span>탐활서 승인 대기</span>
          <strong>{data.pendingActivityRequests.length}건</strong>
        </article>
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <AlertTriangle size={18} />
          <h2>오늘의 운영 큐</h2>
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
              <em>탐활서 승인 대기</em>
            </article>
          ))}
          {data.pendingPetitions.map((petition) => (
            <article key={petition.id} className="queue-row">
              <div>
                <strong>{petition.title}</strong>
                <span>
                  참여 {petition.participantCount}/{petition.threshold}명
                </span>
              </div>
              <em>청원 진행 중</em>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
