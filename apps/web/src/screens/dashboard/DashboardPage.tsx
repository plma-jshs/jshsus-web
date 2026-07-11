import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  FileText,
  Loader2,
  Megaphone,
  MessageSquareText,
  PackageSearch,
} from 'lucide-react';
import { getHomeDashboard, getSession } from '../../lib/api';

const quickLinkIcons = {
  points: BadgeCheck,
  activity: ClipboardCheck,
  notices: Megaphone,
  board: MessageSquareText,
  petitions: FileText,
  lost: PackageSearch,
} as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export function DashboardPage() {
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const dashboardQuery = useQuery({ queryKey: ['home-dashboard'], queryFn: getHomeDashboard });

  if (dashboardQuery.isLoading) {
    return (
      <section className="loading-panel">
        <Loader2 className="spin" size={22} />
        <span>대시보드를 불러오는 중</span>
      </section>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <section className="error-panel">
        <h2>데이터를 불러오지 못했습니다</h2>
        <p>잠시 후 다시 시도해주세요.</p>
      </section>
    );
  }

  const dashboard = dashboardQuery.data;
  const session = sessionQuery.data;

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">전남과학고등학교 학생 생활 포털</p>
          <h1>
            {session?.isLogined && session.name
              ? `${session.name}님, 안녕하세요.`
              : '과구리에 오신 것을 환영합니다.'}
          </h1>
          <p>공지, 탐구활동서, 청원과 학생 생활 정보를 한 곳에서 확인하세요.</p>
        </div>
        {session?.isLogined ? (
          <Link to="/my-status" className="dashboard-primary-link">
            내 상태 확인 <ArrowRight size={17} />
          </Link>
        ) : (
          <a href="/login" className="dashboard-primary-link">
            로그인 <ArrowRight size={17} />
          </a>
        )}
      </section>

      <section className="dashboard-quick-links" aria-label="빠른 서비스">
        {dashboard.quickLinks.map((item) => {
          const Icon = quickLinkIcons[item.id as keyof typeof quickLinkIcons] ?? ArrowRight;
          return (
            <a key={item.id} href={item.href} className="dashboard-quick-link">
              <Icon size={20} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-card dashboard-card-wide">
          <header>
            <div>
              <p>학교 소식</p>
              <h2>공지사항</h2>
            </div>
            <Link to="/notices">전체 보기</Link>
          </header>
          <div className="dashboard-list">
            {dashboard.notices.length === 0 ? (
              <p className="empty-text">등록된 공지가 없습니다.</p>
            ) : null}
            {dashboard.notices.map((notice) => (
              <Link key={notice.id} to="/notices" className="dashboard-list-row">
                <span className={notice.pinned ? 'dashboard-badge pinned' : 'dashboard-badge'}>
                  {notice.pinned ? '필독' : notice.department}
                </span>
                <strong>{notice.title}</strong>
                <time dateTime={notice.publishedAt}>{formatDate(notice.publishedAt)}</time>
              </Link>
            ))}
          </div>
        </section>

        <section className="dashboard-card">
          <header>
            <div>
              <p>학생 참여</p>
              <h2>청원·제안</h2>
            </div>
            <Link to="/petitions">전체 보기</Link>
          </header>
          <div className="dashboard-stack">
            {dashboard.petitions.length === 0 ? (
              <p className="empty-text">진행 중인 청원이 없습니다.</p>
            ) : null}
            {dashboard.petitions.map((petition) => {
              const progress = Math.min(
                100,
                Math.round((petition.participantCount / petition.threshold) * 100),
              );
              return (
                <Link key={petition.id} to="/petitions" className="dashboard-petition">
                  <strong>{petition.title}</strong>
                  <span>
                    {petition.participantCount}명 참여 · 목표 {petition.threshold}명
                  </span>
                  <span className="dashboard-progress" aria-label={`달성률 ${progress}%`}>
                    <span style={{ width: `${progress}%` }} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="dashboard-card">
          <header>
            <div>
              <p>최근 등록</p>
              <h2>분실물</h2>
            </div>
            <Link to="/lost-items">전체 보기</Link>
          </header>
          <div className="dashboard-stack">
            {dashboard.lostItems.length === 0 ? (
              <p className="empty-text">등록된 분실물이 없습니다.</p>
            ) : null}
            {dashboard.lostItems.map((item) => (
              <Link key={item.id} to="/lost-items" className="dashboard-lost-item">
                <span className="dashboard-badge">{item.type === 'lost' ? '분실' : '습득'}</span>
                <span>
                  <strong>{item.itemName}</strong>
                  <small>{item.location || '장소 미상'}</small>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
