import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AuthLayout } from './AuthLayout';
import { logoutSso } from './api';

export function SsoLogoutPage() {
  const started = useRef(false);
  const returnTo = new URLSearchParams(window.location.search).get('returnTo') ?? '';
  const logoutMutation = useMutation({
    mutationFn: logoutSso,
    onSuccess: ({ redirectUrl }) => window.location.replace(redirectUrl),
  });
  const completeLogout = logoutMutation.mutate;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeLogout(returnTo);
  }, [completeLogout, returnTo]);

  return (
    <AuthLayout active="login" title={logoutMutation.isError ? '로그아웃 실패' : '로그아웃 중'}>
      {logoutMutation.isError ? (
        <p className="auth-error" role="alert">
          통합로그아웃을 완료하지 못했습니다. 창을 닫고 다시 시도해 주세요.
        </p>
      ) : (
        <p className="auth-help" role="status">
          연결된 서비스의 로그인 세션을 정리하고 있습니다.
        </p>
      )}
    </AuthLayout>
  );
}
