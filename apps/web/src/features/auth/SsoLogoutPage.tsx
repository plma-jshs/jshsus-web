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

  if (!logoutMutation.isError) return null;

  return (
    <AuthLayout active="login" title="로그아웃 실패">
      <p className="auth-error" role="alert">
        통합로그아웃을 완료하지 못했습니다. 창을 닫고 다시 시도해 주세요.
      </p>
    </AuthLayout>
  );
}
