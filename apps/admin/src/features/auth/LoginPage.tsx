import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import type { FormEvent, InputHTMLAttributes } from 'react';
import { useState } from 'react';
import { AdminApiError, api } from '../../shared/api/adminApi';

type LoginMode = 'login' | 'new-password' | 'forgot' | 'confirm-reset';
type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
};

function PasswordInput({ label, id, ...inputProps }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="login-form-field">
      <label htmlFor={id}>{label}</label>
      <div className="login-password-field">
        <input id={id} type={visible ? 'text' : 'password'} {...inputProps} />
        <button
          type="button"
          aria-label={visible ? `${label} 숨기기` : `${label} 보기`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
        </button>
      </div>
    </div>
  );
}

function getAuthErrorMessage(error: unknown, context: LoginMode) {
  if (!(error instanceof AdminApiError)) {
    return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }

  switch (error.code) {
    case 'AUTH_INVALID_CREDENTIALS':
      return context === 'login'
        ? '학번·교사번호 또는 비밀번호를 확인해 주세요.'
        : '입력한 계정 또는 인증 정보를 확인해 주세요.';
    case 'AUTH_PASSWORD_RESET_REQUIRED':
      return '비밀번호 재설정이 필요한 계정입니다. 비밀번호 찾기를 이용해 주세요.';
    case 'AUTH_CODE_MISMATCH':
      return '인증 코드가 올바르지 않습니다.';
    case 'AUTH_CODE_EXPIRED':
      return '인증 코드가 만료되었습니다. 새 코드를 받아 주세요.';
    case 'AUTH_INVALID_PASSWORD':
      return '비밀번호가 보안 규칙을 충족하지 않습니다.';
    case 'AUTH_RATE_LIMITED':
      return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    case 'AUTH_FLOW_EXPIRED':
      return '비밀번호 변경 시간이 만료되었습니다. 로그인부터 다시 진행해 주세요.';
    case 'AUTH_ACCOUNT_NOT_LINKED':
    case 'AUTH_ACCOUNT_LINK_MISMATCH':
    case 'AUTH_ACCOUNT_LINK_CONFLICT':
      return '통합로그인 계정 연결 상태를 학교 담당자에게 확인해 주세요.';
    case 'AUTH_ACCOUNT_ATTRIBUTES_REQUIRED':
    case 'AUTH_ACCOUNT_ROLE_REQUIRED':
    case 'AUTH_ROLE_REQUIRED':
      return '통합로그인 계정 정보에 문제가 있습니다. 학교 담당자에게 문의해 주세요.';
    case 'AUTH_USER_NOT_CONFIRMED':
      return '계정의 이메일 인증이 필요합니다.';
    case 'AUTH_PASSWORD_RESET_UNAVAILABLE':
    case 'AUTH_RECOVERY_UNAVAILABLE':
      return '이 계정의 비밀번호 재설정은 학교 담당자에게 문의해 주세요.';
    default:
      if (error.status === 401) return '학번·교사번호 또는 비밀번호를 확인해 주세요.';
      if (error.status === 429) return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
      if (error.status && error.status >= 500) {
        return '로그인 서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
      }
      return '입력한 정보를 확인한 뒤 다시 시도해 주세요.';
  }
}

export function LoginPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<LoginMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [flowId, setFlowId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [validationError, setValidationError] = useState('');

  const finishLogin = async () => {
    setNotice('');
    await queryClient.invalidateQueries({ queryKey: ['admin-session'] });
  };

  const loginMutation = useMutation({
    mutationFn: api.login,
    onSuccess: async (result) => {
      setValidationError('');
      if (result.status === 'NEW_PASSWORD_REQUIRED') {
        setFlowId(result.flowId);
        setNewPassword('');
        setNewPasswordConfirmation('');
        setMode('new-password');
        return;
      }
      await finishLogin();
    },
    onError: (error) => {
      if (error instanceof AdminApiError && error.code === 'AUTH_PASSWORD_RESET_REQUIRED') {
        setPassword('');
        setNotice('새 비밀번호를 설정하려면 인증 코드를 받아 주세요.');
        setMode('forgot');
      }
    },
  });

  const newPasswordMutation = useMutation({
    mutationFn: api.completeNewPassword,
    onSuccess: finishLogin,
    onError: (error) => {
      if (
        error instanceof AdminApiError &&
        ['AUTH_PASSWORD_CHANGED_RELOGIN_REQUIRED', 'AUTH_FLOW_EXPIRED'].includes(error.code ?? '')
      ) {
        setFlowId('');
        setPassword('');
        setNewPassword('');
        setNewPasswordConfirmation('');
        setValidationError('');
        setNotice(
          error.code === 'AUTH_PASSWORD_CHANGED_RELOGIN_REQUIRED'
            ? '비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.'
            : '비밀번호 변경 시간이 만료되었습니다. 다시 로그인해 주세요.',
        );
        setMode('login');
      }
    },
  });

  const forgotMutation = useMutation({
    mutationFn: api.requestPasswordReset,
    onSuccess: () => {
      setValidationError('');
      setNotice('입력한 계정에서 이메일 인증을 사용할 수 있다면 인증 코드를 보냈습니다.');
      setCode('');
      setNewPassword('');
      setNewPasswordConfirmation('');
      setMode('confirm-reset');
    },
  });

  const confirmResetMutation = useMutation({
    mutationFn: api.confirmPasswordReset,
    onSuccess: () => {
      setPassword('');
      setCode('');
      setNewPassword('');
      setNewPasswordConfirmation('');
      setValidationError('');
      setNotice('비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.');
      setMode('login');
    },
  });

  const clearMutationErrors = () => {
    loginMutation.reset();
    newPasswordMutation.reset();
    forgotMutation.reset();
    confirmResetMutation.reset();
    setValidationError('');
  };

  const showLogin = () => {
    clearMutationErrors();
    setFlowId('');
    setNotice('');
    setMode('login');
  };

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice('');
    setValidationError('');
    loginMutation.mutate({ username: username.trim(), password, remember });
  };

  const handleNewPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError('');
    if (newPassword !== newPasswordConfirmation) {
      setValidationError('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    newPasswordMutation.mutate({ flowId, newPassword });
  };

  const handleForgot = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice('');
    setValidationError('');
    forgotMutation.mutate({ username: username.trim() });
  };

  const handleConfirmReset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError('');
    if (newPassword !== newPasswordConfirmation) {
      setValidationError('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    confirmResetMutation.mutate({ username: username.trim(), code: code.trim(), newPassword });
  };

  const activeError =
    validationError ||
    (mode === 'login' && loginMutation.isError
      ? getAuthErrorMessage(loginMutation.error, 'login')
      : '') ||
    (mode === 'new-password' && newPasswordMutation.isError
      ? getAuthErrorMessage(newPasswordMutation.error, 'new-password')
      : '') ||
    (mode === 'forgot' && forgotMutation.isError
      ? getAuthErrorMessage(forgotMutation.error, 'forgot')
      : '') ||
    (mode === 'confirm-reset' && confirmResetMutation.isError
      ? getAuthErrorMessage(confirmResetMutation.error, 'confirm-reset')
      : '');

  return (
    <main className="login-shell" aria-labelledby="admin-login-title">
      <section className="login-panel">
        <div className="login-brand">
          <img className="login-brand-mark" src="/admin-emblem.svg" alt="" width="38" height="38" />
          <strong>전남과학고등학교 학생부 전산망</strong>
        </div>

        <header className="login-heading">
          <h1 id="admin-login-title">
            {mode === 'login' && '전남과학고 통합로그인'}
            {mode === 'new-password' && '새 비밀번호 설정'}
            {mode === 'forgot' && '비밀번호 찾기'}
            {mode === 'confirm-reset' && '비밀번호 재설정'}
          </h1>
          {mode === 'new-password' ? (
            <p>처음 로그인하는 계정입니다. 사용할 비밀번호를 설정해 주세요.</p>
          ) : null}
          {mode === 'forgot' ? (
            <p>계정에 등록된 이메일로 비밀번호 재설정 코드를 보내드립니다.</p>
          ) : null}
          {mode === 'confirm-reset' ? (
            <p>
              <strong>{username}</strong> 계정으로 받은 인증 코드와 새 비밀번호를 입력해 주세요.
            </p>
          ) : null}
        </header>

        {notice ? (
          <p className="login-notice" role="status">
            {notice}
          </p>
        ) : null}

        {mode === 'login' ? (
          <form className="login-form" onSubmit={handleLogin}>
            <label htmlFor="admin-login-username">
              <span>학번 또는 교사번호</span>
              <input
                id="admin-login-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                inputMode="numeric"
                placeholder="학번 또는 교사번호를 입력하세요"
                autoFocus
                required
              />
            </label>
            <PasswordInput
              id="admin-login-password"
              label="비밀번호"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="비밀번호를 입력하세요"
              required
            />

            {activeError ? (
              <p className="form-error" role="alert">
                {activeError}
              </p>
            ) : null}

            <div className="login-options">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span>로그인 기억하기</span>
              </label>
              <button
                className="login-text-button"
                type="button"
                onClick={() => {
                  clearMutationErrors();
                  setNotice('');
                  setMode('forgot');
                }}
              >
                비밀번호를 잊으셨나요?
              </button>
            </div>

            <button
              className="primary-button login-submit"
              type="submit"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? '로그인 중' : '로그인'}
            </button>
          </form>
        ) : null}

        {mode === 'forgot' ? (
          <form className="login-form" onSubmit={handleForgot}>
            <label htmlFor="admin-forgot-username">
              <span>학번 또는 교사번호</span>
              <input
                id="admin-forgot-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                inputMode="numeric"
                placeholder="학번 또는 교사번호를 입력하세요"
                autoFocus
                required
              />
            </label>

            {activeError ? (
              <p className="form-error" role="alert">
                {activeError}
              </p>
            ) : null}

            <div className="login-actions">
              <button className="login-secondary-button" type="button" onClick={showLogin}>
                취소
              </button>
              <button
                className="primary-button login-submit"
                type="submit"
                disabled={forgotMutation.isPending}
              >
                {forgotMutation.isPending ? '전송 중' : '인증 코드 받기'}
              </button>
            </div>
          </form>
        ) : null}

        {mode === 'confirm-reset' ? (
          <form className="login-form" onSubmit={handleConfirmReset}>
            <label htmlFor="admin-reset-code">
              <span>인증 코드</span>
              <input
                id="admin-reset-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="인증 코드를 입력하세요"
                autoFocus
                required
              />
            </label>
            <PasswordInput
              id="admin-reset-password"
              label="새 비밀번호"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="8자 이상 입력하세요"
              minLength={8}
              required
            />
            <PasswordInput
              id="admin-reset-password-confirmation"
              label="새 비밀번호 확인"
              value={newPasswordConfirmation}
              onChange={(event) => setNewPasswordConfirmation(event.target.value)}
              autoComplete="new-password"
              placeholder="새 비밀번호를 다시 입력하세요"
              minLength={8}
              required
            />

            {activeError ? (
              <p className="form-error" role="alert">
                {activeError}
              </p>
            ) : null}

            <button
              className="login-text-button login-resend-button"
              type="button"
              onClick={() => forgotMutation.mutate({ username: username.trim() })}
              disabled={forgotMutation.isPending}
            >
              인증 코드 다시 받기
            </button>
            <div className="login-actions">
              <button className="login-secondary-button" type="button" onClick={showLogin}>
                취소
              </button>
              <button
                className="primary-button login-submit"
                type="submit"
                disabled={confirmResetMutation.isPending}
              >
                {confirmResetMutation.isPending ? '변경 중' : '비밀번호 변경'}
              </button>
            </div>
          </form>
        ) : null}

        {mode === 'new-password' ? (
          <form className="login-form" onSubmit={handleNewPassword}>
            <div className="login-account-summary">
              <span>계정</span>
              <strong>{username}</strong>
            </div>
            <PasswordInput
              id="admin-new-password"
              label="새 비밀번호"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="8자 이상 입력하세요"
              minLength={8}
              autoFocus
              required
            />
            <PasswordInput
              id="admin-new-password-confirmation"
              label="새 비밀번호 확인"
              value={newPasswordConfirmation}
              onChange={(event) => setNewPasswordConfirmation(event.target.value)}
              autoComplete="new-password"
              placeholder="새 비밀번호를 다시 입력하세요"
              minLength={8}
              required
            />

            {activeError ? (
              <p className="form-error" role="alert">
                {activeError}
              </p>
            ) : null}

            <div className="login-actions">
              <button className="login-secondary-button" type="button" onClick={showLogin}>
                취소
              </button>
              <button
                className="primary-button login-submit"
                type="submit"
                disabled={newPasswordMutation.isPending}
              >
                {newPasswordMutation.isPending ? '설정 중' : '비밀번호 설정'}
              </button>
            </div>
          </form>
        ) : null}

        {mode === 'login' ? (
          <p className="login-signup">계정 발급이 필요하면 학교 담당자에게 문의해 주세요.</p>
        ) : null}
      </section>
    </main>
  );
}
