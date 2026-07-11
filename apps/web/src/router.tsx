import { useState, useEffect } from 'react';
import { Link, Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  ClipboardCheck,
  FileText,
  Home,
  Megaphone,
  Sun,
  Moon,
  User,
  Search,
} from 'lucide-react';
import { DashboardPage } from './screens/dashboard/DashboardPage';
import { ActivityRequestsPage } from './screens/activity/ActivityRequestsPage';
import { BoardPage } from './screens/content/BoardPage';
import { LostItemsPage } from './screens/content/LostItemsPage';
import { NoticesPage } from './screens/content/NoticesPage';
import { PetitionsPage } from './screens/petitions/PetitionsPage';
import { MyStatusPage } from './screens/status/MyStatusPage';
import { LoginPage } from './screens/auth/LoginPage';
import { getSession, logout } from './lib/api';

function AppShell() {
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
    }
    return 'light';
  });

  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: getSession,
  });

  const session = sessionQuery.data;
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      window.location.assign('/');
    },
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className="app-shell">
      <header className="portal-header">
        <div className="portal-header-inner">
          <Link to="/" className="portal-brand" aria-label="과구리 홈">
            <strong>과구리</strong>
            <span>전남과학고등학교 학생맞춤 정보포털</span>
          </Link>

          <nav className="portal-nav" aria-label="주요 메뉴">
            <div className="nav-item-group">
              <span className="nav-group-title">소식·일정</span>
              <div className="nav-dropdown">
                <Link to="/notices" className="dropdown-link">
                  공지사항
                </Link>
                <Link to="/" className="dropdown-link">
                  학사일정
                </Link>
              </div>
            </div>

            <div className="nav-item-group">
              <span className="nav-group-title">학교생활</span>
              <div className="nav-dropdown">
                <Link to="/activity-requests" className="dropdown-link">
                  탐구활동서
                </Link>
                <Link to="/my-status" className="dropdown-link">
                  상벌점/휴대폰
                </Link>
                <Link to="/lost-items" className="dropdown-link">
                  분실물
                </Link>
              </div>
            </div>

            <div className="nav-item-group">
              <span className="nav-group-title">커뮤니티</span>
              <div className="nav-dropdown">
                <Link to="/boards/free" className="dropdown-link">
                  자유게시판
                </Link>
                <Link to="/petitions" className="dropdown-link">
                  청원·제안
                </Link>
              </div>
            </div>

            <div className="nav-item-group">
              <span className="nav-group-title">방송·도구</span>
              <div className="nav-dropdown">
                <a
                  href="https://jshsus.kr/jbs"
                  className="dropdown-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  JBS
                </a>
                <a
                  href="https://plma.jshsus.kr"
                  className="dropdown-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  기상곡 신청
                </a>
                <a
                  href="https://jshsus.kr/bytes"
                  className="dropdown-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  세특 바이트 계산기
                </a>
                <a
                  href="https://admin.jshsus.kr"
                  className="dropdown-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  관리자
                </a>
              </div>
            </div>
          </nav>

          <div className="portal-header-right">
            <div className="header-search-container">
              <input
                type="text"
                placeholder="검색어를 입력하세요"
                className="header-search-input"
              />
              <Search size={15} className="search-icon" />
            </div>

            <button
              className="icon-button theme-toggle"
              type="button"
              onClick={toggleTheme}
              aria-label="테마 변경"
            >
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>

            {session?.isLogined ? (
              <div className="portal-session-actions">
                <Link to="/my-status" className="user-profile-button">
                  <User size={13} />
                  <span>{session.name}님</span>
                </Link>
                <button
                  type="button"
                  className="session-logout"
                  onClick={() => logoutMutation.mutate()}
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <a className="login-button-header" href="/login">
                로그인
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="main-panel">
        <Outlet />
      </main>

      <nav className="mobile-tabbar" aria-label="모바일 주요 메뉴">
        <Link to="/" className="mobile-tab" activeProps={{ className: 'mobile-tab active' }}>
          <Home size={18} />
          <span>홈</span>
        </Link>
        <Link to="/notices" className="mobile-tab" activeProps={{ className: 'mobile-tab active' }}>
          <Megaphone size={18} />
          <span>공지</span>
        </Link>
        <Link
          to="/activity-requests"
          className="mobile-tab"
          activeProps={{ className: 'mobile-tab active' }}
        >
          <ClipboardCheck size={18} />
          <span>탐활서</span>
        </Link>
        <Link
          to="/petitions"
          className="mobile-tab"
          activeProps={{ className: 'mobile-tab active' }}
        >
          <FileText size={18} />
          <span>청원</span>
        </Link>
        <Link
          to="/my-status"
          className="mobile-tab"
          activeProps={{ className: 'mobile-tab active' }}
        >
          <BadgeCheck size={18} />
          <span>내 상태</span>
        </Link>
      </nav>

      <footer className="portal-footer">
        <span>Copyright 2026 IT부</span>
        <span>함께하는 전남과학고등학교, JSHSUS.kr</span>
      </footer>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});

const noticesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notices',
  component: NoticesPage,
});

const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boards/free',
  component: BoardPage,
});

const petitionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/petitions',
  component: PetitionsPage,
});

const activityRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity-requests',
  component: ActivityRequestsPage,
});

const myStatusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/my-status',
  component: MyStatusPage,
});

const lostItemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lost-items',
  component: LostItemsPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  noticesRoute,
  boardRoute,
  petitionsRoute,
  activityRequestsRoute,
  myStatusRoute,
  lostItemsRoute,
  loginRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
