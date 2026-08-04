import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

type AuthSection = 'login' | 'password' | 'activation';

export function AuthLayout({
  active: _active,
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
          <span className="auth-intro__wordmark" aria-hidden="true">
            JSHSUS
          </span>
        </aside>

        <section className="auth-panel">
          <header className="auth-heading">
            <h1 id="auth-page-title">{title}</h1>
            {description ? <p>{description}</p> : null}
          </header>
          {children}
        </section>
      </div>
      <footer className="auth-page-footer">
        <nav aria-label="법적 고지">
          <Link to="/terms">서비스 이용약관</Link>
          <Link to="/privacy">개인정보 처리 방침</Link>
          <span>Copyright © 2026 전남과학고등학교 IT부</span>
        </nav>
      </footer>
    </section>
  );
}
