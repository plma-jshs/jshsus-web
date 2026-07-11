import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
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
    <section className="login-page">
      <form className="login-card" onSubmit={submit}>
        <span className="login-icon">
          <LogIn size={22} />
        </span>
        <p>통합 계정</p>
        <h1>과구리 로그인</h1>
        <label>
          <span>아이디 또는 학번</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? '로그인 중…' : '로그인'}
        </button>
        {loginMutation.isError ? (
          <p className="form-error">아이디 또는 비밀번호를 확인해주세요.</p>
        ) : null}
      </form>
    </section>
  );
}
