import type { FormEvent, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react';
import { safeInternalReturnTo } from '../../shared/lib/route';
import {
  completeNewPassword,
  continueSso,
  describeSsoRequest,
  getAuthErrorCode,
  getAuthErrorMessage,
  getSession,
  getSsoConfig,
  login,
} from './api';
import { AuthLayout } from './AuthLayout';

type AuthMode = 'login' | 'new-password';

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
      <label className="sr-only" htmlFor={props.id}>
        {props.label}
      </label>
      <div className="auth-password-field">
        <LockKeyhole className="auth-field-icon" size={17} aria-hidden="true" />
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
  const searchParams = new URLSearchParams(window.location.search);
  const ssoRequestId = searchParams.get('sso');
  const requestedReturnTo = searchParams.get('returnTo') ?? '/';
  const isCentralAuthHost = ['auth.jshsus.kr', 'auth.localhost'].includes(window.location.hostname);
  const redirectStarted = useRef(false);
  const continueStarted = useRef(false);
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [remember, setRemember] = useState(false);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ['sso-config'],
    queryFn: getSsoConfig,
    retry: false,
  });
  const requestQuery = useQuery({
    queryKey: ['sso-request', ssoRequestId],
    queryFn: () => describeSsoRequest(ssoRequestId ?? ''),
    enabled: configQuery.data?.isAuthOrigin === true && Boolean(ssoRequestId),
    retry: false,
  });
  const centralSessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: getSession,
    enabled: configQuery.data?.isAuthOrigin === true && Boolean(ssoRequestId),
    retry: false,
  });
  const continueSsoMutation = useMutation({
    mutationFn: continueSso,
    onSuccess: ({ redirectUrl }) => window.location.replace(redirectUrl),
  });
  const continueSsoRequest = continueSsoMutation.mutate;

  useLayoutEffect(() => {
    if (isCentralAuthHost || redirectStarted.current) return;
    redirectStarted.current = true;
    const authorizeUrl = new URL('/api/auth/sso/authorize', window.location.origin);
    authorizeUrl.searchParams.set(
      'returnTo',
      safeInternalReturnTo(requestedReturnTo, window.location.origin),
    );
    window.location.replace(authorizeUrl.toString());
  }, [isCentralAuthHost, requestedReturnTo]);

  useEffect(() => {
    if (
      !ssoRequestId ||
      !centralSessionQuery.data?.isLogined ||
      continueStarted.current ||
      requestQuery.isError
    ) {
      return;
    }
    continueStarted.current = true;
    continueSsoRequest(ssoRequestId);
  }, [centralSessionQuery.data, continueSsoRequest, requestQuery.isError, ssoRequestId]);

  const finishLogin = async () => {
    await queryClient.invalidateQueries({ queryKey: ['session'] });
    if (ssoRequestId) {
      continueStarted.current = true;
      continueSsoMutation.mutate(ssoRequestId);
      return;
    }
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    if (returnTo) {
      window.location.assign(safeInternalReturnTo(returnTo, window.location.origin));
      return;
    }
    window.location.assign(configQuery.data?.defaultServiceOrigin ?? '/');
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
        const forgotUrl = new URL('/forgot-password', window.location.origin);
        forgotUrl.searchParams.set('username', username.trim());
        if (ssoRequestId) {
          forgotUrl.searchParams.set('returnTo', `/login?sso=${ssoRequestId}`);
        }
        window.location.assign(`${forgotUrl.pathname}${forgotUrl.search}`);
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

  const resetTransientState = (nextMode: AuthMode) => {
    if (nextMode === 'login') setFlowId(null);
    setMode(nextMode);
    setValidationError(null);
    setNotice(null);
    loginMutation.reset();
    newPasswordMutation.reset();
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

  const title = mode === 'login' ? '전남과학고 통합로그인' : '새 비밀번호 설정';
  const normalizedUsername = username.trim();
  const forgotPasswordHref = normalizedUsername
    ? `/forgot-password?username=${encodeURIComponent(normalizedUsername)}${
        ssoRequestId ? `&returnTo=${encodeURIComponent(`/login?sso=${ssoRequestId}`)}` : ''
      }`
    : ssoRequestId
      ? `/forgot-password?returnTo=${encodeURIComponent(`/login?sso=${ssoRequestId}`)}`
      : '/forgot-password';

  const activeError =
    validationError ??
    (continueSsoMutation.isError
      ? getAuthErrorMessage(
          continueSsoMutation.error,
          '통합로그인 요청을 완료하지 못했습니다. 이용할 서비스에서 다시 시작해 주세요.',
        )
      : null) ??
    (mode === 'login' && loginMutation.isError
      ? getAuthErrorMessage(loginMutation.error, '학번·교사번호 또는 비밀번호를 확인해 주세요.')
      : mode === 'new-password' && newPasswordMutation.isError
        ? getAuthErrorMessage(newPasswordMutation.error, '비밀번호를 변경하지 못했습니다.')
        : null);

  if (!isCentralAuthHost) return null;

  if (configQuery.isError) {
    return (
      <AuthLayout active="login" title="통합로그인을 불러오지 못했습니다">
        <FormMessage>잠시 후 페이지를 새로고침해 주세요.</FormMessage>
      </AuthLayout>
    );
  }

  if (ssoRequestId && requestQuery.isError) {
    return (
      <AuthLayout active="login" title="로그인 요청 만료">
        <FormMessage>이용할 서비스로 돌아가 로그인을 다시 시작해 주세요.</FormMessage>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      active="login"
      title={title}
      description={
        mode === 'new-password' ? '처음 로그인하는 계정의 비밀번호를 변경해 주세요.' : undefined
      }
    >
      {mode === 'login' ? (
        <form className="auth-form" onSubmit={submitLogin}>
          <label htmlFor="login-username">
            <span className="sr-only">학번 또는 교사번호</span>
            <span className="auth-input-shell">
              <UserRound className="auth-field-icon" size={17} aria-hidden="true" />
              <input
                id="login-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="학번 또는 교사번호를 입력해주세요."
                autoFocus
                required
              />
            </span>
          </label>
          <PasswordField
            id="login-password"
            label="비밀번호"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            placeholder="비밀번호를 입력해주세요."
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
            <a className="auth-link-button" href={forgotPasswordHref}>
              비밀번호를 잊으셨나요?
            </a>
          </div>

          <button className="auth-submit" type="submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? (
              <>
                <LoaderCircle className="auth-loading-icon" size={18} aria-hidden="true" />
                <span className="sr-only">로그인 처리 중</span>
              </>
            ) : (
              '로그인'
            )}
          </button>
          <p className="auth-signup-prompt">
            통합로그인 계정이 없나요?{' '}
            <a
              href={
                ssoRequestId
                  ? `/account-activation?returnTo=${encodeURIComponent(`/login?sso=${ssoRequestId}`)}`
                  : '/account-activation'
              }
            >
              계정 생성하기
            </a>
          </p>
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
            placeholder="새 비밀번호"
          />
          <PasswordField
            id="new-password-confirm"
            label="새 비밀번호 확인"
            value={newPasswordConfirm}
            onChange={setNewPasswordConfirm}
            autoComplete="new-password"
            placeholder="새 비밀번호 확인"
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
    </AuthLayout>
  );
}
