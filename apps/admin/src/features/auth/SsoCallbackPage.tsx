import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { api } from '../../shared/api/adminApi';

export function SsoCallbackPage() {
  const queryClient = useQueryClient();
  const started = useRef(false);
  const search = new URLSearchParams(window.location.search);
  const code = search.get('code');
  const state = search.get('state');
  const exchangeMutation = useMutation({
    mutationFn: api.exchangeSso,
    onSuccess: async ({ returnTo }) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-session'] });
      window.location.replace(returnTo || '/');
    },
  });
  const exchange = exchangeMutation.mutate;

  useEffect(() => {
    if (!code || !state || started.current) return;
    started.current = true;
    exchange({ code, state });
  }, [code, exchange, state]);

  const hasInvalidInput = !code || !state;
  return (
    <main className="login-shell">
      <section className="login-panel" aria-live="polite">
        <div className="login-brand">
          <img className="login-brand-mark" src="/admin-emblem.svg" alt="" width="38" height="38" />
          <strong>전남과학고등학교 학생부 전산망</strong>
        </div>
        <header className="login-heading">
          <h1>
            {hasInvalidInput || exchangeMutation.isError ? '로그인 확인 실패' : '로그인 확인 중'}
          </h1>
        </header>
        {hasInvalidInput || exchangeMutation.isError ? (
          <>
            <p className="login-error" role="alert">
              로그인 확인 코드가 만료되었거나 이미 사용되었습니다.
            </p>
            <a className="login-submit login-submit--link" href="/">
              다시 로그인
            </a>
          </>
        ) : (
          <p className="login-notice" role="status">
            <LoaderCircle className="login-loading-icon" size={18} aria-hidden="true" />
            학생부 전산망 세션을 연결하고 있습니다.
          </p>
        )}
      </section>
    </main>
  );
}
