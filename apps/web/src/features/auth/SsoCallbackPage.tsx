import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AuthLayout } from './AuthLayout';
import { exchangeSso, getAuthErrorMessage } from './api';

export function SsoCallbackPage() {
  const started = useRef(false);
  const search = new URLSearchParams(window.location.search);
  const code = search.get('code');
  const state = search.get('state');
  const exchangeMutation = useMutation({
    mutationFn: exchangeSso,
    onSuccess: ({ returnTo }) => window.location.replace(returnTo || '/'),
  });
  const exchange = exchangeMutation.mutate;

  useEffect(() => {
    if (!code || !state || started.current) return;
    started.current = true;
    exchange({ code, state });
  }, [code, exchange, state]);

  const error =
    !code || !state
      ? '로그인 확인 정보가 없습니다. 로그인을 다시 시작해 주세요.'
      : exchangeMutation.isError
        ? getAuthErrorMessage(
            exchangeMutation.error,
            '로그인 확인 코드가 만료되었거나 이미 사용되었습니다.',
          )
        : null;

  if (!error) return null;

  return (
    <AuthLayout active="login" title="로그인을 완료하지 못했습니다">
      <p className="auth-error" role="alert">
        {error}
      </p>
      <a className="auth-submit auth-submit--link" href="/login">
        다시 로그인
      </a>
    </AuthLayout>
  );
}
