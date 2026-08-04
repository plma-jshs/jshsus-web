import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { api } from '../../shared/api/adminApi';

export function SsoLoginPage() {
  const started = useRef(false);
  const startMutation = useMutation({
    mutationFn: api.startSso,
    onSuccess: ({ authorizationUrl }) => window.location.replace(authorizationUrl),
  });
  const startLogin = startMutation.mutate;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startLogin(`${window.location.pathname}${window.location.search}`);
  }, [startLogin]);

  return (
    <main className="login-shell">
      <section className="login-panel" aria-live="polite">
        <div className="login-brand">
          <img className="login-brand-mark" src="/admin-emblem.svg" alt="" width="38" height="38" />
          <strong>전남과학고등학교 학생부 전산망</strong>
        </div>
        <header className="login-heading">
          <h1>통합로그인으로 이동 중</h1>
        </header>
        {startMutation.isError ? (
          <>
            <p className="login-error" role="alert">
              통합로그인 페이지로 이동하지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
            <button
              className="login-submit"
              type="button"
              onClick={() => startMutation.mutate('/')}
            >
              다시 시도
            </button>
          </>
        ) : (
          <p className="login-notice" role="status">
            <LoaderCircle className="login-loading-icon" size={18} aria-hidden="true" />
            안전한 로그인 페이지를 연결하고 있습니다.
          </p>
        )}
      </section>
    </main>
  );
}
