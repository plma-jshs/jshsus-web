import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { KeyRound, UserPlus, UserRound } from 'lucide-react';

type AuthSection = 'login' | 'password' | 'activation';

const authNavigation = [
  { section: 'login' as const, label: '로그인', to: '/login', icon: UserRound },
  { section: 'password' as const, label: '비밀번호 찾기', to: '/forgot-password', icon: KeyRound },
  { section: 'activation' as const, label: '계정 생성', to: '/account-activation', icon: UserPlus },
];

export function AuthLayout({
  active,
  title,
  description,
  children,
}: {
  active: AuthSection;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="auth-page" aria-labelledby="auth-page-title">
      <div className="auth-card">
        <aside className="auth-intro">
          <Link to="/" className="auth-brand" aria-label="과구리 홈으로 이동">
            <img
              className="auth-brand-mark"
              src="/assets/lIcon.png"
              alt=""
              width="32"
              height="32"
            />
            <strong>과구리</strong>
          </Link>
          <div className="auth-intro__copy">
            <span>전남과학고등학교</span>
            <h2>
              학교생활을
              <br />더 편리하게.
            </h2>
            <p>학사일정, 탐구활동서, 상벌점과 공지를 통합 계정으로 확인할 수 있습니다.</p>
          </div>
        </aside>

        <section className="auth-panel">
          <header className="auth-heading">
            <span>전남과학고등학교</span>
            <h1 id="auth-page-title">{title}</h1>
            {description ? <p>{description}</p> : null}
          </header>
          {children}
        </section>

        <nav className="auth-rail" aria-label="통합로그인 메뉴">
          {authNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.section}
                to={item.to}
                search={
                  item.section === 'login'
                    ? { returnTo: undefined }
                    : item.section === 'password'
                      ? { username: undefined }
                      : undefined
                }
                className={item.section === active ? 'is-active' : undefined}
                aria-current={item.section === active ? 'page' : undefined}
                title={item.label}
              >
                <Icon size={21} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <p className="auth-page-footer">Copyright © 2026 전남과학고등학교 IT부</p>
    </section>
  );
}
