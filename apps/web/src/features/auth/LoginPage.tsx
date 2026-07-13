import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { safeInternalReturnTo } from '../../shared/lib/route';
import { login } from './api';
import '../../styles/auth.css';

export function LoginPage() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      const returnTo = new URLSearchParams(window.location.search).get('returnTo');
      window.location.assign(safeInternalReturnTo(returnTo, window.location.origin));
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loginMutation.mutate({ username, password, remember });
  };

  return (
    <section className="auth-page" aria-labelledby="login-title">
      <Link to="/" className="auth-brand" aria-label="과구리 홈으로 이동">
        <img src="/assets/lIcon.png" alt="" width="34" height="34" />
        <strong>과구리</strong>
      </Link>

      <div className="auth-card">
        <header>
          <h1 id="login-title">전남과학고 통합로그인</h1>
        </header>

        <form onSubmit={submit}>
          <label htmlFor="login-username">
            <span>아이디 또는 학번</span>
            <input
              id="login-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="아이디 또는 학번을 입력하세요"
              autoFocus
              required
            />
          </label>
          <label htmlFor="login-password">
            <span>비밀번호</span>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="비밀번호를 입력하세요"
              required
            />
          </label>

          {loginMutation.isError ? (
            <p className="auth-error" role="alert">
              아이디 또는 비밀번호를 확인해 주세요.
            </p>
          ) : null}

          <div className="auth-options">
            <label className="auth-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              <span>로그인 기억하기</span>
            </label>
            <a href="https://iam.jshsus.kr/changepassword">비밀번호를 잊으셨나요?</a>
          </div>

          <button
            className="detail-primary-button auth-submit"
            type="submit"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? '로그인 중' : '로그인'}
          </button>
        </form>

        <p className="auth-signup">
          전남과학고 신입생이신가요? <a href="https://iam.jshsus.kr/reg">통합로그인 계정 만들기</a>
        </p>
      </div>
    </section>
  );
}
