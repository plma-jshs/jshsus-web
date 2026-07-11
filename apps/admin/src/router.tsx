import { Link, Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  BedDouble,
  ClipboardCheck,
  Gauge,
  KeyRound,
  ListChecks,
  LockKeyhole,
  Newspaper,
  ScrollText,
  School,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { ActivityPage } from './screens/ActivityPage';
import { AuditLogsPage } from './screens/AuditLogsPage';
import { ContentPage } from './screens/ContentPage';
import { DashboardPage } from './screens/DashboardPage';
import { DeviceCasesPage } from './screens/DeviceCasesPage';
import { DormPage } from './screens/DormPage';
import { IamPage } from './screens/IamPage';
import { PointsPage } from './screens/PointsPage';
import { PetitionsPage } from './screens/PetitionsPage';
import { UsersPage } from './screens/UsersPage';
import { api } from './lib/api';
import type { UserRole } from '@jshsus/types';

function LoginPage() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('local-admin');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('system_admin');
  const loginMutation = useMutation({
    mutationFn: api.login,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-session'] });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loginMutation.mutate({ username, password, role });
  };

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-brand">
          <span>
            <ShieldCheck size={22} />
          </span>
          <div>
            <p>admin.jshsus.kr</p>
            <h1>관리자 로그인</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>계정</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            <span>비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label>
            <span>역할</span>
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              <option value="system_admin">system_admin</option>
              <option value="student_affairs_head">student_affairs_head</option>
              <option value="teacher">teacher</option>
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? '확인 중' : '로그인'}
          </button>
          {loginMutation.isError ? <p className="form-error">로그인 정보를 확인해주세요.</p> : null}
        </form>
      </section>
    </main>
  );
}

function AdminShell() {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ['admin-session'],
    queryFn: api.session,
    retry: false,
  });
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

  const activeRole = sessionQuery.data.roles?.[0] ?? sessionQuery.data.permissions?.[0] ?? 'staff';

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span>관리</span>
          <div>
            <strong>과구리 운영</strong>
            <small>Student Affairs Console</small>
          </div>
        </div>

        <nav className="admin-nav">
          <span className="admin-nav-heading">요약</span>
          <Link
            to="/"
            className="admin-nav-item"
            activeProps={{ className: 'admin-nav-item active' }}
            data-domain="dashboard"
          >
            <Gauge size={18} />
            <span>대시보드</span>
          </Link>
          <span className="admin-nav-heading">생활 관리</span>
          <Link
            to="/points"
            className="admin-nav-item"
            activeProps={{ className: 'admin-nav-item active' }}
            data-domain="points"
          >
            <BadgeCheck size={18} />
            <span>상벌점</span>
          </Link>
          <Link
            to="/device-cases"
            className="admin-nav-item"
            activeProps={{ className: 'admin-nav-item active' }}
            data-domain="cases"
          >
            <Smartphone size={18} />
            <span>보관함</span>
          </Link>
          <Link
            to="/dorm"
            className="admin-nav-item"
            activeProps={{ className: 'admin-nav-item active' }}
            data-domain="dorm"
          >
            <BedDouble size={18} />
            <span>기숙사</span>
          </Link>
          <Link
            to="/activity-requests"
            className="admin-nav-item"
            activeProps={{ className: 'admin-nav-item active' }}
            data-domain="activity"
          >
            <ClipboardCheck size={18} />
            <span>탐활서 승인</span>
          </Link>
          <span className="admin-nav-heading">커뮤니티</span>
          <Link
            to="/petitions"
            className="admin-nav-item"
            activeProps={{ className: 'admin-nav-item active' }}
            data-domain="petitions"
          >
            <ListChecks size={18} />
            <span>청원 답변</span>
          </Link>
          <Link
            to="/content"
            className="admin-nav-item"
            activeProps={{ className: 'admin-nav-item active' }}
            data-domain="content"
          >
            <Newspaper size={18} />
            <span>콘텐츠 운영</span>
          </Link>
          <span className="admin-nav-heading">운영</span>
          <Link
            to="/users"
            className="admin-nav-item"
            activeProps={{ className: 'admin-nav-item active' }}
            data-domain="users"
          >
            <School size={18} />
            <span>학생/교직원</span>
          </Link>
          <Link
            to="/iam"
            className="admin-nav-item"
            activeProps={{ className: 'admin-nav-item active' }}
            data-domain="iam"
          >
            <KeyRound size={18} />
            <span>IAM 권한</span>
          </Link>
          <Link
            to="/audit-logs"
            className="admin-nav-item"
            activeProps={{ className: 'admin-nav-item active' }}
            data-domain="audit"
          >
            <ScrollText size={18} />
            <span>감사 로그</span>
          </Link>
        </nav>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <p>admin.jshsus.kr</p>
            <h1>학생생활안전부 통합 관리자</h1>
          </div>
          <div className="admin-topbar-actions">
            <div className="admin-queue-chip">
              <span>오늘 처리할 일</span>
              <strong>상벌점 · 탐활서 · 청원 큐 확인</strong>
            </div>
            <div className="role-pill">
              <LockKeyhole size={16} />
              <span>{activeRole}</span>
            </div>
            <button
              className="quiet-button"
              type="button"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              로그아웃
            </button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}

const rootRoute = createRootRoute({ component: AdminShell });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});
const pointsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/points',
  component: PointsPage,
});
const casesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/device-cases',
  component: DeviceCasesPage,
});
const dormRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dorm',
  component: DormPage,
});
const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity-requests',
  component: ActivityPage,
});
const petitionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/petitions',
  component: PetitionsPage,
});
const contentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/content',
  component: ContentPage,
});
const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/users',
  component: UsersPage,
});
const iamRoute = createRoute({ getParentRoute: () => rootRoute, path: '/iam', component: IamPage });
const auditLogsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/audit-logs',
  component: AuditLogsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  pointsRoute,
  casesRoute,
  dormRoute,
  activityRoute,
  petitionsRoute,
  contentRoute,
  usersRoute,
  iamRoute,
  auditLogsRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
