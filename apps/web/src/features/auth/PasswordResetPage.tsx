import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Eye, EyeOff, KeyRound, LockKeyhole, UserRound } from 'lucide-react';
import {
  confirmPasswordReset,
  getAuthErrorMessage,
  requestPasswordReset,
  type PasswordResetDelivery,
} from './api';
import { AuthLayout } from './AuthLayout';

type ResetStep = 'request' | 'confirm';

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

function initialUsername() {
  if (typeof window === 'undefined') return '';
  const value = new URLSearchParams(window.location.search).get('username')?.trim() ?? '';
  if (!/^".*"$/.test(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'string' ? parsed.trim() : value;
  } catch {
    return value.slice(1, -1).trim();
  }
}

function initialReturnTo() {
  if (typeof window === 'undefined') return undefined;
  const value = new URLSearchParams(window.location.search).get('returnTo');
  return value?.startsWith('/') && !value.startsWith('//') ? value : undefined;
}

export function PasswordResetPage() {
  const returnTo = initialReturnTo();
  const loginReturnHref = returnTo ?? '/login';
  const [step, setStep] = useState<ResetStep>('request');
  const [username, setUsername] = useState(initialUsername);
  const [delivery, setDelivery] = useState<PasswordResetDelivery>('phone');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const requestMutation = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => {
      setStep('confirm');
      setConfirmationCode('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setValidationError(null);
      setNotice(
        delivery === 'phone'
          ? '등록된 전화번호로 인증 코드를 보냈습니다'
          : '등록된 이메일로 인증 코드를 보냈습니다',
      );
    },
  });

  const confirmMutation = useMutation({
    mutationFn: confirmPasswordReset,
    onSuccess: () => {
      window.alert('비밀번호가 정상적으로 변경되었습니다');
      window.location.assign('/login');
    },
  });

  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    setValidationError(null);
    requestMutation.mutate({ username: username.trim(), delivery });
  };

  const submitConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== newPasswordConfirm) {
      setValidationError('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    setValidationError(null);
    confirmMutation.mutate({
      username: username.trim(),
      code: confirmationCode,
      newPassword,
    });
  };

  const activeError =
    validationError ??
    (step === 'request' && requestMutation.isError
      ? getAuthErrorMessage(requestMutation.error, '인증 코드를 요청하지 못했습니다.')
      : step === 'confirm' && confirmMutation.isError
        ? getAuthErrorMessage(confirmMutation.error, '인증 코드와 새 비밀번호를 확인해 주세요.')
        : null);

  return (
    <AuthLayout active="password" title="비밀번호 찾기">
      {step === 'request' ? (
        <form className="auth-form" onSubmit={submitRequest}>
          <label htmlFor="forgot-username">
            <span className="sr-only">학번 또는 교사번호</span>
            <span className="auth-input-shell">
              <UserRound className="auth-field-icon" size={17} aria-hidden="true" />
              <input
                id="forgot-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="학번 또는 교사번호를 입력해주세요."
                autoFocus
                required
              />
            </span>
          </label>
          <fieldset className="auth-recovery-method">
            <legend>인증 방법</legend>
            <label>
              <input
                type="radio"
                name="password-reset-delivery"
                value="phone"
                checked={delivery === 'phone'}
                onChange={() => setDelivery('phone')}
              />
              <span>카카오톡 또는 문자</span>
            </label>
            <label>
              <input
                type="radio"
                name="password-reset-delivery"
                value="email"
                checked={delivery === 'email'}
                onChange={() => setDelivery('email')}
              />
              <span>이메일</span>
            </label>
          </fieldset>
          {activeError ? <FormMessage>{activeError}</FormMessage> : null}
          <button className="auth-submit" type="submit" disabled={requestMutation.isPending}>
            {requestMutation.isPending ? '전송 중' : '인증 코드 받기'}
          </button>
          <Link
            className="auth-back-button"
            to="/login"
            search={{ returnTo: loginReturnHref === '/login' ? undefined : loginReturnHref }}
          >
            <ArrowLeft size={15} aria-hidden="true" />{' '}
            {returnTo === '/my-status' ? '마이페이지로 돌아가기' : '로그인으로 돌아가기'}
          </Link>
        </form>
      ) : null}

      {step === 'confirm' ? (
        <form className="auth-form" onSubmit={submitConfirm}>
          {notice ? <FormMessage success>{notice}</FormMessage> : null}
          <label htmlFor="confirmation-code">
            <span className="sr-only">인증 코드</span>
            <span className="auth-input-shell">
              <KeyRound className="auth-field-icon" size={17} aria-hidden="true" />
              <input
                id="confirmation-code"
                value={confirmationCode}
                onChange={(event) => setConfirmationCode(event.target.value.replace(/\s/g, ''))}
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="인증코드를 입력해주세요."
                autoFocus
                required
              />
            </span>
          </label>
          <PasswordField
            id="reset-password"
            label="새 비밀번호"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            placeholder="새 비밀번호를 입력해주세요."
          />
          <PasswordField
            id="reset-password-confirm"
            label="새 비밀번호 확인"
            value={newPasswordConfirm}
            onChange={setNewPasswordConfirm}
            autoComplete="new-password"
            placeholder="새 비밀번호를 다시 입력해주세요."
          />
          <p className="auth-help">
            8자 이상으로 입력하고, 이름이나 학번과 다른 비밀번호를 사용하세요.
          </p>
          {activeError ? <FormMessage>{activeError}</FormMessage> : null}
          <div className="auth-inline-actions">
            <button
              className="auth-link-button auth-resend-button"
              type="button"
              disabled={requestMutation.isPending}
              onClick={() => requestMutation.mutate({ username: username.trim(), delivery })}
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
            onClick={() => {
              setStep('request');
              setNotice(null);
              setValidationError(null);
            }}
          >
            <ArrowLeft size={15} aria-hidden="true" /> 비밀번호 찾기로 돌아가기
          </button>
        </form>
      ) : null}
    </AuthLayout>
  );
}
