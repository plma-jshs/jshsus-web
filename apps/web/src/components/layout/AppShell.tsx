import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet } from '@tanstack/react-router';
import { useRef } from 'react';
import {
  BadgeCheck,
  ChevronDown,
  ClipboardCheck,
  Home,
  LogOut,
  Menu,
  MessageSquareText,
  Megaphone,
  User,
} from 'lucide-react';
import { getSession, logout } from '../../lib/api';

function DesktopNavigation() {
  return (
    <nav
      className="portal-nav"
      aria-label="주요 메뉴"
      onClick={(event) => {
        if ((event.target as Element).closest('a')) {
          (event.target as Element).closest('details')?.removeAttribute('open');
        }
      }}
    >
      <details className="nav-menu">
        <summary>
          소식·일정 <ChevronDown aria-hidden="true" size={15} />
        </summary>
        <div className="nav-menu__panel">
          <Link to="/notices">공지사항</Link>
          <a href="/#academic-schedule">학사일정</a>
        </div>
      </details>

      <details className="nav-menu">
        <summary>
          학교생활 <ChevronDown aria-hidden="true" size={15} />
        </summary>
        <div className="nav-menu__panel">
          <Link to="/activity-requests">탐구활동서</Link>
          <Link to="/my-status">상벌점·생활정보</Link>
          <Link to="/lost-items">분실물</Link>
        </div>
      </details>

      <details className="nav-menu">
        <summary>
          커뮤니티 <ChevronDown aria-hidden="true" size={15} />
        </summary>
        <div className="nav-menu__panel">
          <Link to="/boards/free">자유게시판</Link>
          <Link to="/petitions">청원·제안</Link>
        </div>
      </details>

      <details className="nav-menu">
        <summary>
          방송·도구 <ChevronDown aria-hidden="true" size={15} />
        </summary>
        <div className="nav-menu__panel nav-menu__panel--wide">
          <a href="https://jshsus.kr/jbs" target="_blank" rel="noreferrer">
            JBS
          </a>
          <a href="https://plma.jshsus.kr" target="_blank" rel="noreferrer">
            기상곡 신청
          </a>
          <a href="https://jshsus.kr/bytes" target="_blank" rel="noreferrer">
            세특 바이트 계산기
          </a>
          <a href="https://admin.jshsus.kr" target="_blank" rel="noreferrer">
            관리자
          </a>
        </div>
      </details>
    </nav>
  );
}

function MobileMenu() {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const closeMenu = () => menuRef.current?.removeAttribute('open');

  return (
    <details ref={menuRef} className="mobile-menu">
      <summary aria-label="전체 메뉴 열기">
        <Menu aria-hidden="true" size={20} />
      </summary>
      <nav className="mobile-menu__panel" aria-label="전체 메뉴">
        <strong>소식·일정</strong>
        <Link to="/notices" onClick={closeMenu}>
          공지사항
        </Link>
        <a href="/#academic-schedule" onClick={closeMenu}>
          학사일정
        </a>
        <strong>학교생활</strong>
        <Link to="/activity-requests" onClick={closeMenu}>
          탐구활동서
        </Link>
        <Link to="/my-status" onClick={closeMenu}>
          상벌점·생활정보
        </Link>
        <Link to="/lost-items" onClick={closeMenu}>
          분실물
        </Link>
        <strong>커뮤니티</strong>
        <Link to="/boards/free" onClick={closeMenu}>
          자유게시판
        </Link>
        <Link to="/petitions" onClick={closeMenu}>
          청원·제안
        </Link>
        <strong>방송·도구</strong>
        <a href="https://jshsus.kr/jbs" target="_blank" rel="noreferrer" onClick={closeMenu}>
          JBS
        </a>
        <a href="https://plma.jshsus.kr" target="_blank" rel="noreferrer" onClick={closeMenu}>
          기상곡 신청
        </a>
        <a href="https://jshsus.kr/bytes" target="_blank" rel="noreferrer" onClick={closeMenu}>
          세특 바이트 계산기
        </a>
        <a href="https://admin.jshsus.kr" target="_blank" rel="noreferrer" onClick={closeMenu}>
          관리자
        </a>
      </nav>
    </details>
  );
}

export function AppShell() {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: getSession,
  });
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      window.location.assign('/');
    },
  });

  const session = sessionQuery.data;

  return (
    <div className="app-shell">
      <header className="portal-header">
        <div className="portal-header__inner">
          <Link to="/" className="portal-brand" aria-label="과구리 홈">
            <strong>과구리</strong>
            <span>전남과학고등학교 학생맞춤 정보포털</span>
          </Link>

          <DesktopNavigation />

          <div className="portal-header__actions">
            {session?.isLogined ? (
              <>
                <Link
                  to="/my-status"
                  className="header-user-link"
                  aria-label={`${session.name ?? '사용자'}님의 내 상태 보기`}
                >
                  <User aria-hidden="true" size={16} />
                  <span>{session.name ?? '사용자'}님</span>
                </Link>
                <button
                  className="header-logout-button"
                  type="button"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                  aria-label={logoutMutation.isPending ? '로그아웃 처리 중' : '로그아웃'}
                >
                  <LogOut aria-hidden="true" size={16} />
                  <span>로그아웃</span>
                </button>
              </>
            ) : (
              <Link className="header-login-button" to="/login">
                로그인
              </Link>
            )}
            <MobileMenu />
          </div>
        </div>
      </header>

      <main className="main-panel">
        <Outlet />
      </main>

      <nav className="mobile-tabbar" aria-label="모바일 주요 메뉴">
        <Link to="/" className="mobile-tab" activeProps={{ className: 'mobile-tab is-active' }}>
          <Home aria-hidden="true" size={19} />
          <span>홈</span>
        </Link>
        <Link
          to="/notices"
          className="mobile-tab"
          activeProps={{ className: 'mobile-tab is-active' }}
        >
          <Megaphone aria-hidden="true" size={19} />
          <span>공지</span>
        </Link>
        <Link
          to="/boards/free"
          className="mobile-tab"
          activeProps={{ className: 'mobile-tab is-active' }}
        >
          <MessageSquareText aria-hidden="true" size={19} />
          <span>게시판</span>
        </Link>
        <Link
          to="/activity-requests"
          className="mobile-tab"
          activeProps={{ className: 'mobile-tab is-active' }}
        >
          <ClipboardCheck aria-hidden="true" size={19} />
          <span>탐활서</span>
        </Link>
        <Link
          to="/my-status"
          className="mobile-tab"
          activeProps={{ className: 'mobile-tab is-active' }}
        >
          <BadgeCheck aria-hidden="true" size={19} />
          <span>내 상태</span>
        </Link>
      </nav>

      <footer className="portal-footer">
        <div>
          <strong>과구리</strong>
          <span>전남과학고등학교 학생맞춤 정보포털</span>
        </div>
        <p>© 전남과학고등학교. 학생 생활에 필요한 정보를 한곳에서 제공합니다.</p>
        <div className="portal-footer__links" aria-label="관련 메뉴">
          <Link to="/notices">공지사항</Link>
          <Link to="/lost-items">분실물</Link>
          <a href="https://admin.jshsus.kr" target="_blank" rel="noreferrer">
            관리자
          </a>
        </div>
      </footer>
    </div>
  );
}
