import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Eye, EyeOff, KeyRound, LockKeyhole, UserRound } from 'lucide-react';
import {
  confirmPasswordReset,
  getAuthErrorMessage,
  requestPasswordReset,
  verifyPasswordResetCode,
  type PasswordResetDelivery,
} from './api';
import { AuthLayout } from './AuthLayout';

type ResetStep = 'request' | 'verify' | 'confirm';

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

function ResetMessageSlot({ error, notice }: { error?: string | null; notice?: string | null }) {
  return (
    <div className="auth-password-reset-message-slot">
      {error ? (
        <FormMessage>{error}</FormMessage>
      ) : notice ? (
        <FormMessage success>{notice}</FormMessage>
      ) : null}
    </div>
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

function initialReturnOrigin() {
  if (typeof window === 'undefined') return undefined;
  const value = new URLSearchParams(window.location.search).get('returnOrigin');
  if (!value) return undefined;

  try {
    const url = new URL(value);
    const isLocalHost =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname.endsWith('.localhost');
    const isJshsusHost = url.hostname === 'jshsus.kr' || url.hostname.endsWith('.jshsus.kr');
    return isLocalHost || isJshsusHost ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export function PasswordResetPage() {
  const returnTo = initialReturnTo();
  const returnOrigin = initialReturnOrigin();
  const loginReturnHref = returnTo ?? '/login';
  const returnHref =
    returnTo && returnOrigin ? new URL(returnTo, returnOrigin).toString() : undefined;
  const [step, setStep] = useState<ResetStep>('request');
  const [username, setUsername] = useState(initialUsername);
  const [delivery, setDelivery] = useState<PasswordResetDelivery>('phone');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const confirmMutation = useMutation({
    mutationFn: confirmPasswordReset,
    onSuccess: () => {
      window.alert('비밀번호가 정상적으로 변경되었습니다');
      window.location.assign('/login');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: verifyPasswordResetCode,
    onSuccess: (result) => {
      confirmMutation.reset();
      setResetToken(result.resetToken);
      setStep('confirm');
      setValidationError(null);
      setNotice('인증이 완료되었습니다. 새 비밀번호를 설정해 주세요.');
    },
  });

  const requestMutation = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => {
      verifyMutation.reset();
      confirmMutation.reset();
      setStep('verify');
      setConfirmationCode('');
      setResetToken(null);
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

  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    setValidationError(null);
    requestMutation.mutate({ username: username.trim(), delivery });
  };

  const submitConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== newPasswordConfirm) {
      setValidationError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (!resetToken) {
      setValidationError('인증 코드를 먼저 확인해 주세요.');
      return;
    }
    setValidationError(null);
    setNotice(null);
    confirmMutation.mutate({
      username: username.trim(),
      resetToken,
      newPassword,
    });
  };

  const submitVerify = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);
    verifyMutation.mutate({ username: username.trim(), code: confirmationCode });
  };

  const activeError =
    validationError ??
    (step === 'request' && requestMutation.isError
      ? getAuthErrorMessage(requestMutation.error, '인증 코드를 요청하지 못했습니다.')
      : step === 'verify' && verifyMutation.isError
        ? getAuthErrorMessage(verifyMutation.error, '인증 코드를 확인해 주세요.')
        : step === 'confirm' && confirmMutation.isError
          ? getAuthErrorMessage(confirmMutation.error, '새 비밀번호를 확인해 주세요.')
          : null);

  return (
    <AuthLayout active="password" title="비밀번호 찾기" className="auth-page--password-reset">
      <div className="auth-password-reset-stage">
        {step === 'request' ? (
          <form key="request" className="auth-form" onSubmit={submitRequest}>
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
            <ResetMessageSlot error={activeError} />
            <button className="auth-submit" type="submit" disabled={requestMutation.isPending}>
              {requestMutation.isPending ? '전송 중' : '인증 코드 받기'}
            </button>
            {returnTo === '/my-status' && returnHref ? (
              <a className="auth-back-button" href={returnHref}>
                <ArrowLeft size={15} aria-hidden="true" /> 마이페이지로 돌아가기
              </a>
            ) : (
              <Link
                className="auth-back-button"
                to="/login"
                search={{ returnTo: loginReturnHref === '/login' ? undefined : loginReturnHref }}
              >
                <ArrowLeft size={15} aria-hidden="true" /> 로그인으로 돌아가기
              </Link>
            )}
          </form>
        ) : null}

        {step === 'verify' ? (
          <form key="verify" className="auth-form auth-password-reset-form" onSubmit={submitVerify}>
            <ResetMessageSlot notice={notice} error={activeError} />
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
            <div className="auth-inline-actions">
              <button
                className="auth-link-button auth-resend-button"
                type="button"
                disabled={requestMutation.isPending || verifyMutation.isPending}
                onClick={() => requestMutation.mutate({ username: username.trim(), delivery })}
              >
                인증 코드 다시 받기
              </button>
            </div>
            <button
              className="auth-submit"
              type="submit"
              disabled={verifyMutation.isPending || !/^\d{4,16}$/.test(confirmationCode)}
            >
              {verifyMutation.isPending ? '확인 중' : '인증 코드 확인'}
            </button>
            <button
              className="auth-back-button"
              type="button"
              onClick={() => {
                setStep('request');
                setNotice(null);
                setValidationError(null);
                setResetToken(null);
                setConfirmationCode('');
              }}
            >
              <ArrowLeft size={15} aria-hidden="true" /> 이전으로
            </button>
          </form>
        ) : null}

        {step === 'confirm' ? (
          <form key="confirm" className="auth-form" onSubmit={submitConfirm}>
            <ResetMessageSlot notice={notice} error={activeError} />
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
            <div className="auth-inline-actions">
              <button
                className="auth-link-button auth-resend-button"
                type="button"
                disabled={requestMutation.isPending || confirmMutation.isPending}
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
                setStep('verify');
                confirmMutation.reset();
                setNotice(null);
                setValidationError(null);
                setResetToken(null);
                setConfirmationCode('');
              }}
            >
              <ArrowLeft size={15} aria-hidden="true" /> 이전으로
            </button>
          </form>
        ) : null}
      </div>
    </AuthLayout>
  );
}
