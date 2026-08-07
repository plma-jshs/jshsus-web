import { useLayoutEffect, useRef, useState } from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { api } from '../../shared/api/adminApi';

export function SsoLoginPage() {
  const started = useRef(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (import.meta.env.DEV) return;
    if (started.current) return;
    started.current = true;
    const authorizeUrl = new URL('/api/auth/sso/authorize', window.location.origin);
    authorizeUrl.searchParams.set(
      'returnTo',
      `${window.location.pathname}${window.location.search}`,
    );
    window.location.replace(authorizeUrl.toString());
  }, []);

  if (import.meta.env.DEV) {
    const startDevelopmentSession = async () => {
      setIsStarting(true);
      setError(null);
      try {
        await api.devSession();
        window.location.reload();
      } catch {
        setError(
          '개발용 세션을 만들지 못했습니다. API의 DEV_AUTH_BYPASS 설정과 로컬 seed를 확인하세요.',
        );
        setIsStarting(false);
      }
    };

    return (
      <main className="login-shell">
        <section className="login-panel dev-auth-panel" aria-labelledby="dev-auth-title">
          <div className="dev-auth-panel__icon" aria-hidden="true">
            <ShieldCheck size={24} />
          </div>
          <h1 id="dev-auth-title">로컬 관리자 화면</h1>
          <p>개발 환경에서만 사용할 수 있는 테스트 관리자 세션입니다.</p>
          <button
            className="primary-button dev-auth-panel__button"
            type="button"
            onClick={startDevelopmentSession}
            disabled={isStarting}
          >
            {isStarting ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : null}
            {isStarting ? '세션 생성 중' : '테스트 계정으로 시작'}
          </button>
          {error ? <p className="form-error">{error}</p> : null}
        </section>
      </main>
    );
  }

  return null;
}
