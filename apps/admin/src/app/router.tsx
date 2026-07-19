import {
  Link,
  Navigate,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  useRouterState,
} from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  BedDouble,
  CalendarDays,
  ClipboardCheck,
  Gauge,
  KeyRound,
  ListChecks,
  LockKeyhole,
  LogOut,
  Menu,
  Music2,
  Newspaper,
  ScrollText,
  School,
  Settings,
  Smartphone,
  UserRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LoginPage } from '../features/auth/LoginPage';
import { api } from '../shared/api/adminApi';

type AdminNavEntry = {
  label: string;
  to: string;
  icon: LucideIcon;
  permissions?: string[];
  roles?: string[];
};

type AdminNavGroup = {
  label: string;
  entries: AdminNavEntry[];
};

const adminNavigation: AdminNavGroup[] = [
  {
    label: '요약',
    entries: [
      {
        label: '대시보드',
        to: '/',
        icon: Gauge,
        roles: ['system_admin', 'student_affairs_head', 'teacher'],
      },
    ],
  },
  {
    label: '상벌점',
    entries: [
      {
        label: '상벌점 현황',
        to: '/points',
        icon: BadgeCheck,
        permissions: ['points.manage'],
      },
      {
        label: '상벌점 기록',
        to: '/points/records',
        icon: ScrollText,
        permissions: ['points.manage'],
      },
      {
        label: '상벌점 부여',
        to: '/points/award',
        icon: ClipboardCheck,
        permissions: ['points.issue'],
      },
      {
        label: '사유 관리',
        to: '/points/reasons',
        icon: ListChecks,
        permissions: ['points.manage'],
      },
      {
        label: '퇴사·학기 조정',
        to: '/points/departures',
        icon: School,
        permissions: ['points.manage'],
      },
    ],
  },
  {
    label: '탐구활동서',
    entries: [
      {
        label: '탐구활동서 현황',
        to: '/activity-requests',
        icon: ClipboardCheck,
        permissions: ['activity.review'],
      },
      {
        label: '승인 · 발급',
        to: '/activity-requests/review',
        icon: BadgeCheck,
        permissions: ['activity.review'],
      },
    ],
  },
  {
    label: '기숙사',
    entries: [
      {
        label: '기숙사 현황',
        to: '/dorm',
        icon: BedDouble,
        permissions: ['dorm.manage'],
      },
      {
        label: '기숙사 관리',
        to: '/dorm/manage',
        icon: School,
        permissions: ['dorm.manage'],
      },
    ],
  },
  {
    label: '기타',
    entries: [
      {
        label: '휴대폰 보관함',
        to: '/device-cases',
        icon: Smartphone,
        permissions: ['devices.manage'],
      },
      {
        label: '기상곡',
        to: '/wake-songs',
        icon: Music2,
        permissions: ['wake_songs.review'],
      },
    ],
  },
  {
    label: '사용자와 권한',
    entries: [
      {
        label: '학생 · 교직원',
        to: '/users',
        icon: School,
        permissions: ['users.manage'],
      },
      {
        label: 'IAM 권한',
        to: '/iam',
        icon: KeyRound,
        permissions: ['iam.manage'],
      },
    ],
  },
  {
    label: '사이트 운영',
    entries: [
      {
        label: '공지 관리',
        to: '/site/notices',
        icon: Newspaper,
        permissions: ['notices.manage'],
      },
      {
        label: '자유게시판 관리',
        to: '/site/community',
        icon: ListChecks,
        permissions: ['community.manage'],
      },
      {
        label: '분실물 관리',
        to: '/site/lost-items',
        icon: School,
        permissions: ['lost_items.manage'],
      },
      {
        label: '학사일정',
        to: '/school-events',
        icon: CalendarDays,
        permissions: ['school_events.manage'],
      },
    ],
  },
  {
    label: '관리자',
    entries: [
      {
        label: '감사 로그',
        to: '/audit-logs',
        icon: ScrollText,
        permissions: ['audit.read'],
      },
      {
        label: '시스템 관리',
        to: '/system',
        icon: Settings,
        roles: ['system_admin'],
      },
    ],
  },
];

const routeTitles: Array<{ prefix: string; eyebrow: string; title: string }> = [
  { prefix: '/points/records', eyebrow: '상벌점', title: '상벌점 기록' },
  { prefix: '/points/award', eyebrow: '상벌점', title: '상벌점 부여' },
  { prefix: '/points/reasons', eyebrow: '상벌점', title: '사유 관리' },
  { prefix: '/points/departures', eyebrow: '상벌점', title: '퇴사자 관리 / 새학기 상벌점 반감' },
  { prefix: '/points', eyebrow: '상벌점', title: '상벌점 현황' },
  { prefix: '/activity-requests/review', eyebrow: '탐구활동서', title: '승인 · 발급' },
  { prefix: '/activity-requests', eyebrow: '탐구활동서', title: '탐구활동서 현황' },
  { prefix: '/dorm/manage', eyebrow: '기숙사', title: '기숙사 관리' },
  { prefix: '/dorm', eyebrow: '기숙사', title: '기숙사 현황' },
  { prefix: '/device-cases', eyebrow: '기타', title: '휴대폰 보관함' },
  { prefix: '/wake-songs', eyebrow: '기타', title: '기상곡' },
  { prefix: '/users', eyebrow: '사용자와 권한', title: '학생 · 교직원' },
  { prefix: '/iam', eyebrow: '사용자와 권한', title: 'IAM 권한' },
  { prefix: '/site/notices', eyebrow: '사이트 운영', title: '공지 관리' },
  { prefix: '/site/community', eyebrow: '사이트 운영', title: '자유게시판 관리' },
  { prefix: '/site/lost-items', eyebrow: '사이트 운영', title: '분실물 관리' },
  { prefix: '/school-events', eyebrow: '사이트 운영', title: '학사일정' },
  { prefix: '/audit-logs', eyebrow: '관리자', title: '감사 로그' },
  { prefix: '/system', eyebrow: '관리자', title: '시스템 관리' },
  { prefix: '/', eyebrow: '요약', title: '대시보드' },
];

function AdminShell() {
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const activeRoute =
    routeTitles.find((route) => pathname.startsWith(route.prefix)) ?? routeTitles.at(-1)!;
  const sessionQuery = useQuery({
    queryKey: ['admin-session'],
    queryFn: api.session,
    retry: false,
  });

  useEffect(() => {
    const pageTitle = sessionQuery.data?.isLogined ? activeRoute.title : '통합로그인';
    document.title = `${pageTitle} | 전남과학고등학교 학생부 전산망`;
  }, [activeRoute.title, sessionQuery.data?.isLogined]);

  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-session'] });
    },
  });

  if (sessionQuery.isLoading) {
    return <main className="login-shell">세션을 확인하는 중입니다.</main>;
  }

  if (!sessionQuery.data?.isLogined) {
    return <LoginPage />;
  }

  const roles = (sessionQuery.data.roles ?? []).map(String);
  const permissions = sessionQuery.data.permissions ?? [];
  const isSystemAdmin = roles.includes('system_admin');
  const hasAccess = (entry: AdminNavEntry) => {
    if (isSystemAdmin) return true;
    const roleMatch = entry.roles?.some((role) => roles.includes(role)) ?? false;
    const permissionMatch =
      entry.permissions?.some((permission) => permissions.includes(permission)) ?? false;
    if (!entry.roles?.length && !entry.permissions?.length) return permissions.length > 0;
    if (entry.roles?.length && entry.permissions?.length) return roleMatch && permissionMatch;
    return roleMatch || permissionMatch;
  };
  const visibleNavigation = adminNavigation
    .map((group) => ({ ...group, entries: group.entries.filter(hasAccess) }))
    .filter((group) => group.entries.length > 0);
  const canUseAdmin = isSystemAdmin || visibleNavigation.length > 0;
  const identitySession = sessionQuery.data as typeof sessionQuery.data & {
    identifier?: string | number;
    teacherNo?: string | number;
  };
  const accountIdentity = [
    identitySession.identifier ?? identitySession.teacherNo ?? sessionQuery.data.stuid,
    sessionQuery.data.name,
  ]
    .filter(Boolean)
    .join(' ');

  if (!canUseAdmin) {
    return (
      <main className="login-shell">
        <section className="access-denied-panel">
          <LockKeyhole size={28} aria-hidden="true" />
          <div>
            <h1>관리자 권한이 없습니다</h1>
            <p>현재 계정에 관리자 기능을 사용할 권한이 배정되어 있지 않습니다.</p>
          </div>
          <button className="quiet-button" type="button" onClick={() => logoutMutation.mutate()}>
            다른 계정으로 로그인
          </button>
        </section>
      </main>
    );
  }

  if (pathname === '/' && !isSystemAdmin) {
    const dashboardEntry = adminNavigation[0]?.entries[0];
    if (dashboardEntry && !hasAccess(dashboardEntry)) {
      const firstAccessibleEntry = visibleNavigation.flatMap((group) => group.entries)[0];
      if (firstAccessibleEntry) {
        return <Navigate to={firstAccessibleEntry.to as never} replace />;
      }
    }
  }

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar${mobileNavigationOpen ? ' open' : ''}`}>
        <div className="admin-sidebar-header">
          <Link to="/" className="admin-brand" onClick={() => setMobileNavigationOpen(false)}>
            <img
              className="admin-brand-mark"
              src="/admin-emblem.svg"
              alt=""
              width="40"
              height="40"
            />
            <div>
              <strong>전남과학고등학교</strong>
              <small>학생부 전산망</small>
            </div>
          </Link>
          <button
            className="admin-mobile-close"
            type="button"
            aria-label="관리자 메뉴 닫기"
            onClick={() => setMobileNavigationOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="admin-nav" aria-label="관리자 메뉴">
          {visibleNavigation.map((group) => (
            <section className="admin-nav-group" key={group.label}>
              <span className="admin-nav-heading">{group.label}</span>
              {group.entries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <Link
                    key={entry.to}
                    to={entry.to as never}
                    className="admin-nav-item"
                    activeProps={{ className: 'admin-nav-item active' }}
                    activeOptions={{ exact: true }}
                    onClick={() => setMobileNavigationOpen(false)}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{entry.label}</span>
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>
      </aside>

      {mobileNavigationOpen ? (
        <button
          className="admin-sidebar-scrim"
          type="button"
          aria-label="관리자 메뉴 닫기"
          onClick={() => setMobileNavigationOpen(false)}
        />
      ) : null}

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-title">
            <button
              className="admin-mobile-menu"
              type="button"
              aria-label="관리자 메뉴 열기"
              onClick={() => setMobileNavigationOpen(true)}
            >
              <Menu size={21} />
            </button>
            <div>
              <p>{activeRoute.eyebrow}</p>
              <h1>{activeRoute.title}</h1>
            </div>
          </div>
          <div className="admin-topbar-actions">
            <div className="admin-user-identity">
              <UserRound size={17} aria-hidden="true" />
              <span>{accountIdentity || sessionQuery.data.name || '관리자'}</span>
            </div>
            <button
              className="admin-logout-button"
              type="button"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <LogOut size={17} aria-hidden="true" />
              <span>로그아웃</span>
            </button>
          </div>
        </header>
        <div className="admin-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

const rootRoute = createRootRoute({ component: AdminShell });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(
    () => import('../features/dashboard/DashboardPage'),
    'DashboardPage',
  ),
});
const pointsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/points',
  component: lazyRouteComponent(
    () => import('../features/points/PointsOverviewPage'),
    'PointsOverviewPage',
  ),
});
const pointRecordsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/points/records',
  component: lazyRouteComponent(
    () => import('../features/points/PointRecordsPage'),
    'PointRecordsPage',
  ),
});
const pointAwardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/points/award',
  component: lazyRouteComponent(
    () => import('../features/points/PointAwardPage'),
    'PointAwardPage',
  ),
});
const pointReasonsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/points/reasons',
  component: lazyRouteComponent(
    () => import('../features/points/PointReasonsPage'),
    'PointReasonsPage',
  ),
});
const pointDeparturesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/points/departures',
  component: lazyRouteComponent(
    () => import('../features/points/PointDeparturesPage'),
    'PointDeparturesPage',
  ),
});
const casesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/device-cases',
  component: lazyRouteComponent(
    () => import('../features/device-cases/DeviceCasesPage'),
    'DeviceCasesPage',
  ),
});
const wakeSongsAdminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wake-songs',
  component: lazyRouteComponent(
    () => import('../features/wake-songs/WakeSongsPage'),
    'WakeSongsPage',
  ),
});
const dormRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dorm',
  component: lazyRouteComponent(
    () => import('../features/dorm/DormOverviewPage'),
    'DormOverviewPage',
  ),
});
const dormManagementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dorm/manage',
  component: lazyRouteComponent(
    () => import('../features/dorm/DormManagementPage'),
    'DormManagementPage',
  ),
});
const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity-requests',
  component: lazyRouteComponent(
    () => import('../features/activity-requests/ActivityOverviewPage'),
    'ActivityOverviewPage',
  ),
});
const activityReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity-requests/review',
  component: lazyRouteComponent(
    () => import('../features/activity-requests/ActivityReviewPage'),
    'ActivityReviewPage',
  ),
});
const noticeManagementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/site/notices',
  component: lazyRouteComponent(
    () => import('../features/content/NoticeManagementPage'),
    'NoticeManagementPage',
  ),
});
const communityManagementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/site/community',
  component: lazyRouteComponent(
    () => import('../features/content/CommunityModerationPage'),
    'CommunityModerationPage',
  ),
});
const lostItemsManagementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/site/lost-items',
  component: lazyRouteComponent(
    () => import('../features/content/LostItemsManagementPage'),
    'LostItemsManagementPage',
  ),
});
const schoolEventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/school-events',
  component: lazyRouteComponent(
    () => import('../features/school-events/SchoolEventsPage'),
    'SchoolEventsPage',
  ),
});
const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/users',
  component: lazyRouteComponent(() => import('../features/users/UsersPage'), 'UsersPage'),
});
const iamRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/iam',
  component: lazyRouteComponent(() => import('../features/iam/IamPage'), 'IamPage'),
});
const auditLogsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/audit-logs',
  component: lazyRouteComponent(
    () => import('../features/audit-logs/AuditLogsPage'),
    'AuditLogsPage',
  ),
});
const systemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/system',
  component: lazyRouteComponent(() => import('../features/system/SystemPage'), 'SystemPage'),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  pointsRoute,
  pointRecordsRoute,
  pointAwardRoute,
  pointReasonsRoute,
  pointDeparturesRoute,
  casesRoute,
  wakeSongsAdminRoute,
  dormRoute,
  dormManagementRoute,
  activityRoute,
  activityReviewRoute,
  noticeManagementRoute,
  communityManagementRoute,
  lostItemsManagementRoute,
  schoolEventsRoute,
  usersRoute,
  iamRoute,
  auditLogsRoute,
  systemRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
