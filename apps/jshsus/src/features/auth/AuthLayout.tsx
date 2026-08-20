import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

type AuthSection = 'login' | 'password' | 'activation';

export function AuthLayout({
  active: _active,
  title,
  description,
  children,
  className,
}: {
  active: AuthSection;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`auth-page${className ? ` ${className}` : ''}`}
      aria-labelledby="auth-page-title"
    >
      <div className="auth-card">
        <aside className="auth-intro">
          <Link to="/" className="auth-brand" aria-label="전남과학고 통합로그인">
            <img
              className="auth-brand-mark"
              src="/assets/school-emblem.svg"
              alt="전남과학고등학교 로고"
              width="38"
              height="38"
            />
            <strong>전남과학고 통합로그인</strong>
          </Link>
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
          <span className="auth-page-footer__separator" aria-hidden="true">
            ·
          </span>
          <Link to="/privacy">개인정보 처리방침</Link>
          <span className="auth-page-footer__separator" aria-hidden="true">
            ·
          </span>
          <span className="auth-page-footer__copyright">
            Copyright © 전남과학고등학교 IT부. All rights reserved.
          </span>
        </nav>
      </footer>
    </section>
  );
}
