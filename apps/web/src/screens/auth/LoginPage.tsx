import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';
import { StateMessage } from '../../components/PortalUi';
import { login } from '../../lib/api';

export function LoginPage() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      window.location.assign('/');
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loginMutation.mutate({ username, password });
  };

  return (
    <section className="portal-page portal-page--login" aria-labelledby="login-title">
      <div className="login-layout">
        <div className="login-intro">
          <span className="login-brand">과구리</span>
          <p className="login-intro__eyebrow">전남과학고등학교 학생맞춤 정보포털</p>
          <h1>학교생활에 필요한 정보를 한곳에서 확인하세요.</h1>
          <p>
            공지와 학생생활 서비스를 안전하게 이용하려면 학교에서 사용하는 계정으로 로그인해 주세요.
          </p>
          <div className="login-security-note">
            <ShieldCheck size={19} aria-hidden="true" />
            <span>공용 기기에서는 이용 후 반드시 로그아웃해 주세요.</span>
          </div>
        </div>

        <div className="login-panel">
          <div className="login-panel__header">
            <span className="login-panel__icon" aria-hidden="true">
              <LockKeyhole size={22} />
            </span>
            <div>
              <span>통합 계정</span>
              <h2 id="login-title">로그인</h2>
            </div>
          </div>

          <form className="portal-form login-form" onSubmit={submit}>
            <label className="portal-field" htmlFor="login-username">
              <span className="portal-field__label">아이디 또는 학번</span>
              <input
                id="login-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                inputMode="text"
                autoFocus
                aria-describedby={loginMutation.isError ? 'login-error' : undefined}
                required
              />
            </label>
            <label className="portal-field" htmlFor="login-password">
              <span className="portal-field__label">비밀번호</span>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                aria-describedby={loginMutation.isError ? 'login-error' : undefined}
                required
              />
            </label>
            <button
              className="portal-button portal-button--primary portal-button--full"
              type="submit"
              disabled={loginMutation.isPending}
            >
              <LogIn size={17} aria-hidden="true" />
              {loginMutation.isPending ? '로그인 중…' : '로그인'}
            </button>
            {loginMutation.isError ? (
              <div id="login-error">
                <StateMessage
                  kind="error"
                  title="로그인하지 못했습니다."
                  description="아이디와 비밀번호를 다시 확인해 주세요."
                  compact
                />
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}
