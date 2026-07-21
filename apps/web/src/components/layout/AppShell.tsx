import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  ChevronDown,
  ClipboardCheck,
  Home,
  LogOut,
  Menu,
  MessageSquareText,
  Megaphone,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { getSession, logout } from '../../features/auth/api';
import { getAdminSiteHref } from '../../shared/lib/adminSiteHref';
import { NotificationMenu } from './NotificationMenu';

type InternalNavigationPath =
  | '/notices'
  | '/calendar'
  | '/activity-requests'
  | '/my-status'
  | '/points'
  | '/lost-items'
  | '/boards/free'
  | '/petitions'
  | '/thanks'
  | '/jbs'
  | '/wake-songs'
  | '/tools/bytes'
  | '/tools/cannon';

type NavigationItem =
  { label: string; to: InternalNavigationPath } | { label: string; href: string };

type NavigationCategory = { label: string; links: readonly NavigationItem[] };

const navigationCategories = [
  {
    label: '소식·일정',
    links: [
      { label: '공지사항', to: '/notices' },
      { label: '학사일정', to: '/calendar' },
    ],
  },
  {
    label: '학교생활',
    links: [
      { label: '탐구활동서', to: '/activity-requests' },
      { label: '상벌점', to: '/points' },
      { label: '분실물', to: '/lost-items' },
    ],
  },
  {
    label: '커뮤니티',
    links: [
      { label: '자유게시판', to: '/boards/free' },
      { label: '청원·제안', to: '/petitions' },
      { label: '감사챌린지', to: '/thanks' },
    ],
  },
  {
    label: '방송·도구',
    links: [
      { label: 'JBS', to: '/jbs' },
      { label: '기상곡 신청', to: '/wake-songs' },
      { label: '세특 바이트 계산기', to: '/tools/bytes' },
      { label: '대포', to: '/tools/cannon' },
    ],
  },
] as const satisfies readonly NavigationCategory[];

function PortalNavigationLink({
  item,
  onNavigate,
}: {
  item: NavigationItem;
  onNavigate?: () => void;
}) {
  return 'to' in item ? (
    <Link to={item.to} onClick={onNavigate}>
      {item.label}
    </Link>
  ) : (
    <a href={item.href} target="_blank" rel="noreferrer" onClick={onNavigate}>
      {item.label}
    </a>
  );
}

function DesktopNavigation() {
  const [openCategory, setOpenCategory] = useState<number | null>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isOpen = openCategory !== null;

  const closeMenu = () => setOpenCategory(null);

  return (
    <nav
      ref={navigationRef}
      className={`portal-nav${isOpen ? ' is-open' : ''}`}
      aria-label="주요 메뉴"
      onMouseLeave={closeMenu}
      onBlur={(event) => {
        if (!navigationRef.current?.contains(event.relatedTarget as Node | null)) closeMenu();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        const activeIndex = openCategory;
        closeMenu();
        if (activeIndex !== null) triggerRefs.current[activeIndex]?.focus();
      }}
      onClick={(event) => {
        const link = (event.target as Element).closest('a');
        if (link instanceof HTMLElement) closeMenu();
      }}
    >
      <div className="portal-nav__triggers">
        {navigationCategories.map((category, index) => (
          <button
            ref={(element) => {
              triggerRefs.current[index] = element;
            }}
            className={openCategory === index ? 'is-active' : undefined}
            type="button"
            aria-haspopup="true"
            aria-expanded={openCategory === index}
            aria-controls="portal-mega-menu"
            onMouseEnter={() => setOpenCategory(index)}
            onFocus={() => setOpenCategory(index)}
            onClick={() => setOpenCategory(index)}
            key={category.label}
          >
            {category.label} <ChevronDown aria-hidden="true" size={15} />
          </button>
        ))}
      </div>

      <div id="portal-mega-menu" className="mega-menu" aria-label="전체 서비스 메뉴">
        <div className="mega-menu__inner">
          {navigationCategories.map((category, index) => (
            <section
              className={openCategory === index ? 'is-active' : undefined}
              onMouseEnter={() => setOpenCategory(index)}
              key={category.label}
            >
              {category.links.map((item) => (
                <PortalNavigationLink item={item} key={item.label} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </nav>
  );
}

function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setIsOpen(false), []);
  const closeMenuAndRestoreFocus = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenuAndRestoreFocus();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closeMenuAndRestoreFocus, isOpen]);

  return (
    <div className="mobile-menu">
      <button
        ref={triggerRef}
        className="mobile-menu__trigger"
        type="button"
        aria-label={isOpen ? '전체 메뉴 닫기' : '전체 메뉴 열기'}
        aria-expanded={isOpen}
        aria-controls="mobile-menu-panel"
        onClick={() => setIsOpen((current) => !current)}
      >
        <Menu aria-hidden="true" size={20} />
      </button>
      {isOpen ? (
        <>
          <button
            className="mobile-menu__scrim"
            type="button"
            aria-label="전체 메뉴 닫기"
            onClick={closeMenuAndRestoreFocus}
          />
          <div
            ref={panelRef}
            id="mobile-menu-panel"
            className="mobile-menu__panel"
            role="dialog"
            aria-modal="true"
            aria-label="전체 메뉴"
          >
            <div className="mobile-menu__header">
              <strong>전체 메뉴</strong>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="전체 메뉴 닫기"
                onClick={closeMenuAndRestoreFocus}
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <nav className="mobile-menu__links" aria-label="전체 서비스">
              {navigationCategories.map((category) => (
                <div className="mobile-menu__group" key={category.label}>
                  <strong>{category.label}</strong>
                  {category.links.map((item) => (
                    <PortalNavigationLink item={item} onNavigate={closeMenu} key={item.label} />
                  ))}
                </div>
              ))}
            </nav>
          </div>
        </>
      ) : null}
    </div>
  );
}

function UserMenu({
  displayName,
  loggingOut,
  onLogout,
}: {
  displayName: string;
  loggingOut: boolean;
  onLogout: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="header-user-menu" ref={menuRef}>
      <button
        className="header-user-link"
        type="button"
        aria-label={`${displayName} 계정 메뉴`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <User aria-hidden="true" size={16} />
        <span>{displayName}</span>
        <ChevronDown className="header-user-link__chevron" aria-hidden="true" size={14} />
      </button>
      {isOpen ? (
        <div className="header-user-dropdown" role="menu" aria-label="계정 메뉴">
          <Link to="/my-status" role="menuitem" onClick={() => setIsOpen(false)}>
            <User aria-hidden="true" size={16} />
            마이페이지
          </Link>
          <a
            href={getAdminSiteHref()}
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            onClick={() => setIsOpen(false)}
          >
            <ShieldCheck aria-hidden="true" size={16} />
            학생부 전산시스템
          </a>
          <button
            className="header-user-dropdown__logout"
            type="button"
            role="menuitem"
            onClick={onLogout}
            disabled={loggingOut}
          >
            <LogOut aria-hidden="true" size={16} />
            {loggingOut ? '로그아웃 중' : '로그아웃'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PortalShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [routeLabel, setRouteLabel] = useState('페이지를 이동했습니다.');
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
  const sessionDisplayName = session?.isLogined
    ? [session.stuid, session.name ?? '사용자'].filter(Boolean).join(' ')
    : '';

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    let lastLabel = '';
    let focused = false;
    const updateRouteFeedback = () => {
      const heading = document.querySelector<HTMLElement>('#main-content h1');
      if (!heading) return;
      const label = heading?.textContent?.trim() || '과구리';
      document.title = label === '과구리' ? label : `${label} | 과구리`;
      if (label === lastLabel) return;
      lastLabel = label;
      setRouteLabel(`${label} 페이지로 이동했습니다.`);
      if (!focused) {
        focused = true;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    };
    const frame = window.requestAnimationFrame(updateRouteFeedback);
    const main = document.querySelector('#main-content');
    const observer = new MutationObserver(updateRouteFeedback);
    if (main) observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);

  return (
    <div className="app-shell">
      <p className="sr-only" aria-live="polite">
        {routeLabel}
      </p>
      <header className="portal-header">
        <div className="portal-header__inner">
          <Link to="/" className="portal-brand" aria-label="과구리 홈">
            <img src="/assets/lIcon.png" alt="" width="32" height="32" />
            <strong>과구리</strong>
          </Link>

          <DesktopNavigation />

          <div className="portal-header__actions">
            {session?.isLogined ? (
              <>
                <NotificationMenu />
                <UserMenu
                  displayName={sessionDisplayName}
                  loggingOut={logoutMutation.isPending}
                  onLogout={() => logoutMutation.mutate()}
                />
              </>
            ) : (
              <Link className="header-login-button" to="/login" search={{ returnTo: undefined }}>
                로그인
              </Link>
            )}
            <MobileMenu />
          </div>
        </div>
      </header>

      <main id="main-content" className="main-panel" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="mobile-tabbar" aria-label="모바일 주요 메뉴">
        <Link
          to="/"
          className="mobile-tab"
          activeOptions={{ exact: true }}
          activeProps={{ className: 'mobile-tab is-active' }}
        >
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
          <span>마이페이지</span>
        </Link>
      </nav>

      <footer className="portal-footer">
        <div className="portal-footer__inner">
          <Link className="portal-footer__brand" to="/about">
            과구리
          </Link>
          <span>
            호스팅서비스사업자: 아이디비아이 | 사업자 등록번호: 332-44-01176 | 사업자 대표: 강재환
          </span>
          <Link to="/privacy">개인정보처리방침</Link>
          <span>Copyright © 2026 IT부 All Rights Reserved.</span>
        </div>
      </footer>
    </div>
  );
}

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isAuthPage =
    pathname === '/login' || pathname === '/forgot-password' || pathname === '/account-activation';
  const isNotFound = useRouterState({
    select: (state) =>
      state.statusCode === 404 || state.matches.some((match) => match.status === 'notFound'),
  });

  useEffect(() => {
    if (isNotFound) {
      document.title = '페이지를 찾을 수 없습니다 | 과구리';
    } else if (pathname === '/login') {
      document.title = '전남과학고 통합로그인 | 과구리';
    } else if (pathname === '/forgot-password') {
      document.title = '비밀번호 찾기 | 과구리';
    } else if (pathname === '/account-activation') {
      document.title = '통합로그인 계정 만들기 | 과구리';
    }
  }, [isNotFound, pathname]);

  if (isNotFound) {
    return (
      <main id="main-content" className="route-not-found-shell">
        <Outlet />
      </main>
    );
  }

  if (isAuthPage) {
    return (
      <main id="main-content" className="auth-shell">
        <Outlet />
      </main>
    );
  }

  return <PortalShell />;
}
