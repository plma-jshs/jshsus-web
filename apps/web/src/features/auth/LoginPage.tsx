import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { safeInternalReturnTo } from '../../shared/lib/route';
import {
  completeNewPassword,
  confirmPasswordReset,
  getAuthErrorCode,
  getAuthErrorMessage,
  login,
  requestPasswordReset,
} from './api';
import '../../styles/auth.css';

type AuthMode = 'login' | 'new-password' | 'forgot-request' | 'forgot-confirm';

function PasswordField(props: {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-form-field">
      <label htmlFor={props.id}>{props.label}</label>
      <div className="auth-password-field">
        <input
          id={props.id}
          type={visible ? 'text' : 'password'}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          autoComplete={props.autoComplete}
          placeholder={props.placeholder}
          required
        />
        <button
          type="button"
          aria-label={visible ? `${props.label} 숨기기` : `${props.label} 보기`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
        </button>
      </div>
    </div>
  );
}

function FormMessage({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return (
    <p className={success ? 'auth-message auth-message-success' : 'auth-error'} role="status">
      {children}
    </p>
  );
}

export function LoginPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [remember, setRemember] = useState(false);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const finishLogin = async () => {
    await queryClient.invalidateQueries({ queryKey: ['session'] });
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    window.location.assign(safeInternalReturnTo(returnTo, window.location.origin));
  };

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async (result) => {
      setValidationError(null);
      if (result.status === 'NEW_PASSWORD_REQUIRED') {
        setFlowId(result.flowId);
        setPassword('');
        setNewPassword('');
        setNewPasswordConfirm('');
        setMode('new-password');
        return;
      }
      await finishLogin();
    },
    onError: (error) => {
      if (getAuthErrorCode(error) === 'AUTH_PASSWORD_RESET_REQUIRED') {
        setPassword('');
        setNotice('새 비밀번호를 설정하려면 인증 코드를 받아 주세요.');
        setMode('forgot-request');
      }
    },
  });

  const newPasswordMutation = useMutation({
    mutationFn: completeNewPassword,
    onSuccess: finishLogin,
    onError: (error) => {
      const code = getAuthErrorCode(error);
      if (code === 'AUTH_PASSWORD_CHANGED_RELOGIN_REQUIRED' || code === 'AUTH_FLOW_EXPIRED') {
        setFlowId(null);
        setPassword('');
        setNewPassword('');
        setNewPasswordConfirm('');
        setValidationError(null);
        setNotice(
          code === 'AUTH_PASSWORD_CHANGED_RELOGIN_REQUIRED'
            ? '비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.'
            : '비밀번호 변경 시간이 만료되었습니다. 다시 로그인해 주세요.',
        );
        setMode('login');
      }
    },
  });

  const forgotMutation = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => {
      setConfirmationCode('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setValidationError(null);
      setNotice('입력한 계정에서 이메일 인증을 사용할 수 있다면 인증 코드를 보냈습니다.');
      setMode('forgot-confirm');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: confirmPasswordReset,
    onSuccess: () => {
      setPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setConfirmationCode('');
      setValidationError(null);
      setNotice('비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.');
      setMode('login');
    },
  });

  const resetTransientState = (nextMode: AuthMode) => {
    if (nextMode === 'login') setFlowId(null);
    setMode(nextMode);
    setValidationError(null);
    setNotice(null);
    loginMutation.reset();
    newPasswordMutation.reset();
    forgotMutation.reset();
    confirmMutation.reset();
  };

  const submitLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    loginMutation.mutate({ username, password, remember });
  };

  const submitNewPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!flowId) {
      setValidationError('로그인부터 다시 진행해 주세요.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setValidationError('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    setValidationError(null);
    newPasswordMutation.mutate({ flowId, newPassword });
  };

  const submitForgotRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);
    forgotMutation.mutate(username);
  };

  const submitForgotConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== newPasswordConfirm) {
      setValidationError('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    setValidationError(null);
    confirmMutation.mutate({ username, code: confirmationCode, newPassword });
  };

  const title =
    mode === 'login'
      ? '전남과학고 통합로그인'
      : mode === 'new-password'
        ? '새 비밀번호 설정'
        : mode === 'forgot-request'
          ? '비밀번호 찾기'
          : '비밀번호 재설정';

  const activeError =
    validationError ??
    (mode === 'login' && loginMutation.isError
      ? getAuthErrorMessage(loginMutation.error, '학번·교사번호 또는 비밀번호를 확인해 주세요.')
      : mode === 'new-password' && newPasswordMutation.isError
        ? getAuthErrorMessage(newPasswordMutation.error, '비밀번호를 변경하지 못했습니다.')
        : mode === 'forgot-request' && forgotMutation.isError
          ? getAuthErrorMessage(forgotMutation.error, '인증 코드를 요청하지 못했습니다.')
          : mode === 'forgot-confirm' && confirmMutation.isError
            ? getAuthErrorMessage(confirmMutation.error, '인증 코드와 새 비밀번호를 확인해 주세요.')
            : null);

  return (
    <section className="auth-page" aria-labelledby="login-title">
      <section className="auth-panel">
        <Link to="/" className="auth-brand" aria-label="과구리 홈으로 이동">
          <img className="auth-brand-mark" src="/assets/lIcon.png" alt="" width="34" height="34" />
          <strong>과구리</strong>
        </Link>

        <header className="auth-heading">
          <h1 id="login-title">{title}</h1>
          {mode !== 'login' ? (
            <p>
              {mode === 'new-password'
                ? '처음 로그인하는 계정의 비밀번호를 변경해 주세요.'
                : '계정에 등록된 이메일로 본인 확인을 진행합니다.'}
            </p>
          ) : null}
        </header>

        {mode === 'login' ? (
          <form className="auth-form" onSubmit={submitLogin}>
            <label htmlFor="login-username">
              <span>학번 또는 교사번호</span>
              <input
                id="login-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="학번 또는 교사번호를 입력하세요"
                autoFocus
                required
              />
            </label>
            <PasswordField
              id="login-password"
              label="비밀번호"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              placeholder="비밀번호를 입력하세요"
            />

            {notice ? <FormMessage success>{notice}</FormMessage> : null}
            {activeError ? <FormMessage>{activeError}</FormMessage> : null}

            <div className="auth-options">
              <label className="auth-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span>로그인 기억하기</span>
              </label>
              <button
                className="auth-link-button"
                type="button"
                onClick={() => resetTransientState('forgot-request')}
              >
                비밀번호를 잊으셨나요?
              </button>
            </div>

            <button className="auth-submit" type="submit" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? '로그인 중' : '로그인'}
            </button>
          </form>
        ) : null}

        {mode === 'new-password' ? (
          <form className="auth-form" onSubmit={submitNewPassword}>
            <PasswordField
              id="new-password"
              label="새 비밀번호"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              placeholder="새 비밀번호를 입력하세요"
            />
            <PasswordField
              id="new-password-confirm"
              label="새 비밀번호 확인"
              value={newPasswordConfirm}
              onChange={setNewPasswordConfirm}
              autoComplete="new-password"
              placeholder="새 비밀번호를 다시 입력하세요"
            />
            <p className="auth-help">
              8자 이상으로 입력하고, 이름이나 학번과 다른 비밀번호를 사용하세요.
            </p>
            {activeError ? <FormMessage>{activeError}</FormMessage> : null}
            <button className="auth-submit" type="submit" disabled={newPasswordMutation.isPending}>
              {newPasswordMutation.isPending ? '변경 중' : '비밀번호 변경'}
            </button>
            <button
              className="auth-back-button"
              type="button"
              onClick={() => resetTransientState('login')}
            >
              <ArrowLeft size={15} aria-hidden="true" /> 로그인으로 돌아가기
            </button>
          </form>
        ) : null}

        {mode === 'forgot-request' ? (
          <form className="auth-form" onSubmit={submitForgotRequest}>
            <label htmlFor="forgot-username">
              <span>학번 또는 교사번호</span>
              <input
                id="forgot-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="학번 또는 교사번호를 입력하세요"
                autoFocus
                required
              />
            </label>
            {notice ? <FormMessage success>{notice}</FormMessage> : null}
            {activeError ? <FormMessage>{activeError}</FormMessage> : null}
            <button className="auth-submit" type="submit" disabled={forgotMutation.isPending}>
              {forgotMutation.isPending ? '전송 중' : '인증 코드 받기'}
            </button>
            <button
              className="auth-back-button"
              type="button"
              onClick={() => resetTransientState('login')}
            >
              <ArrowLeft size={15} aria-hidden="true" /> 로그인으로 돌아가기
            </button>
          </form>
        ) : null}

        {mode === 'forgot-confirm' ? (
          <form className="auth-form" onSubmit={submitForgotConfirm}>
            <label htmlFor="confirmation-code">
              <span>인증 코드</span>
              <input
                id="confirmation-code"
                value={confirmationCode}
                onChange={(event) => setConfirmationCode(event.target.value.replace(/\s/g, ''))}
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="이메일로 받은 코드를 입력하세요"
                autoFocus
                required
              />
            </label>
            <PasswordField
              id="reset-password"
              label="새 비밀번호"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              placeholder="새 비밀번호를 입력하세요"
            />
            <PasswordField
              id="reset-password-confirm"
              label="새 비밀번호 확인"
              value={newPasswordConfirm}
              onChange={setNewPasswordConfirm}
              autoComplete="new-password"
              placeholder="새 비밀번호를 다시 입력하세요"
            />
            {notice ? <FormMessage success>{notice}</FormMessage> : null}
            {activeError ? <FormMessage>{activeError}</FormMessage> : null}
            <div className="auth-inline-actions">
              <button
                className="auth-link-button"
                type="button"
                disabled={forgotMutation.isPending}
                onClick={() => forgotMutation.mutate(username)}
              >
                인증 코드 다시 받기
              </button>
            </div>
            <button className="auth-submit" type="submit" disabled={confirmMutation.isPending}>
              {confirmMutation.isPending ? '변경 중' : '비밀번호 변경'}
            </button>
            <button
              className="auth-back-button"
              type="button"
              onClick={() => resetTransientState('login')}
            >
              <ArrowLeft size={15} aria-hidden="true" /> 로그인으로 돌아가기
            </button>
          </form>
        ) : null}

        {mode === 'login' ? (
          <p className="auth-signup">계정 발급이 필요하면 학교 담당자에게 문의해 주세요.</p>
        ) : null}
      </section>
    </section>
  );
}
