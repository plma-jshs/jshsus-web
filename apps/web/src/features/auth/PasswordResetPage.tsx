import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import {
  confirmPasswordReset,
  getAuthErrorMessage,
  requestPasswordReset,
  verifyPasswordResetCode,
  type PasswordResetDelivery,
} from './api';
import { AuthLayout } from './AuthLayout';
import { OtpInput } from './OtpInput';

type ResetStep = 'request' | 'verify' | 'confirm';

function PasswordField(props: {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  placeholder: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`auth-form-field${props.error ? ' has-error' : ''}`}>
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
      <p className="auth-inline-error" role={props.error ? 'alert' : undefined}>
        {props.error ?? '\u00a0'}
      </p>
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
  const [verificationExpiresAt, setVerificationExpiresAt] = useState(0);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [verificationNow, setVerificationNow] = useState(() => Date.now());

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timeoutId = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

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
      setToastMessage('인증이 완료되었습니다.');
    },
  });

  const requestMutation = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => {
      verifyMutation.reset();
      confirmMutation.reset();
      setStep('verify');
      setConfirmationCode('');
      setVerificationExpiresAt(Date.now() + 179_000);
      setVerificationNow(Date.now());
      setResetToken(null);
      setNewPassword('');
      setNewPasswordConfirm('');
      setValidationError(null);
    },
  });

  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);
    requestMutation.mutate({ username: username.trim(), delivery });
  };

  const passwordError =
    newPassword && !/(?=.*[A-Za-z])(?=.*\d).{8,}/.test(newPassword)
      ? '영문, 숫자 포함 8자 이상 입력해 주세요.'
      : null;
  const passwordConfirmError =
    newPasswordConfirm && newPassword !== newPasswordConfirm
      ? '비밀번호가 일치하지 않습니다.'
      : null;

  const submitConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordError) {
      setValidationError(passwordError);
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setValidationError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (!resetToken) {
      setValidationError('인증 코드를 먼저 확인해 주세요.');
      return;
    }
    setValidationError(null);
    confirmMutation.mutate({
      username: username.trim(),
      resetToken,
      newPassword,
    });
  };

  const submitVerify = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(confirmationCode) || verificationExpiresAt <= Date.now()) return;
    setValidationError(null);
    verifyMutation.mutate({ username: username.trim(), code: confirmationCode });
  };

  useEffect(() => {
    if (step !== 'verify' || !verificationExpiresAt) return undefined;
    const timer = window.setInterval(() => {
      setVerificationNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, verificationExpiresAt]);

  const verificationRemaining = Math.max(0, verificationExpiresAt - verificationNow);
  const verificationTotalSeconds = Math.ceil(verificationRemaining / 1_000);
  const verificationMinutes = Math.floor(verificationTotalSeconds / 60);
  const verificationSeconds = (verificationTotalSeconds % 60).toString().padStart(2, '0');
  const verificationTimerLabel = `${verificationMinutes}:${verificationSeconds}`;

  const activeError =
    validationError ??
    ((step === 'request' || step === 'verify') && requestMutation.isError
      ? getAuthErrorMessage(requestMutation.error, '인증 코드를 요청하지 못했습니다.')
      : step === 'verify' && verifyMutation.isError
        ? getAuthErrorMessage(verifyMutation.error, '인증 코드를 확인해 주세요.')
        : step === 'confirm' && confirmMutation.isError
          ? getAuthErrorMessage(confirmMutation.error, '새 비밀번호를 확인해 주세요.')
          : null);

  return (
    <AuthLayout active="password" title="비밀번호 재설정" className="auth-page--password-reset">
      {toastMessage ? (
        <div className="auth-toast" role="status">
          {toastMessage}
        </div>
      ) : null}
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
            {activeError ? (
              <p className="auth-error" role="alert">
                {activeError}
              </p>
            ) : null}
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
            <OtpInput
              value={confirmationCode}
              error={Boolean(activeError)}
              disabled={verifyMutation.isPending}
              label="인증번호"
              onChange={(value) => {
                setConfirmationCode(value);
                if (validationError) setValidationError(null);
                if (verifyMutation.isError) verifyMutation.reset();
              }}
              onComplete={(value) => {
                if (verifyMutation.isPending) return;
                if (verificationExpiresAt <= Date.now()) {
                  setValidationError('인증 코드가 만료되었습니다. 다시 요청해 주세요.');
                  return;
                }
                setValidationError(null);
                verifyMutation.mutate({ username: username.trim(), code: value });
              }}
            />
            <div className="auth-otp-resend" aria-live="polite">
              <span>인증번호가 오지 않았나요?&nbsp;&nbsp;</span>
              <button
                type="button"
                disabled={requestMutation.isPending || verifyMutation.isPending}
                onClick={() => {
                  setValidationError(null);
                  requestMutation.mutate({ username: username.trim(), delivery });
                }}
              >
                재전송
              </button>
              <span> ({verificationTimerLabel})</span>
            </div>
            {verifyMutation.isPending ? (
              <p className="auth-otp-status" role="status">
                인증번호 확인 중입니다.
              </p>
            ) : null}
            <button
              className="auth-back-button"
              type="button"
              onClick={() => {
                setStep('request');
                setValidationError(null);
                setResetToken(null);
                setConfirmationCode('');
                setVerificationExpiresAt(0);
                setVerificationNow(Date.now());
              }}
            >
              <ArrowLeft size={15} aria-hidden="true" /> 이전으로
            </button>
          </form>
        ) : null}

        {step === 'confirm' ? (
          <form key="confirm" className="auth-form" onSubmit={submitConfirm}>
            <PasswordField
              id="reset-password"
              label="새 비밀번호"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              placeholder="새 비밀번호를 입력해주세요."
              error={passwordError}
            />
            <PasswordField
              id="reset-password-confirm"
              label="새 비밀번호 확인"
              value={newPasswordConfirm}
              onChange={setNewPasswordConfirm}
              autoComplete="new-password"
              placeholder="새 비밀번호를 다시 입력해주세요."
              error={passwordConfirmError ?? (confirmMutation.isError ? activeError : null)}
            />
            <p className="auth-inline-error" role={validationError ? 'alert' : undefined}>
              {validationError && !passwordError && !passwordConfirmError
                ? validationError
                : '\u00a0'}
            </p>
            <button className="auth-submit" type="submit" disabled={confirmMutation.isPending}>
              {confirmMutation.isPending ? '변경 중' : '비밀번호 변경'}
            </button>
            <button
              className="auth-back-button"
              type="button"
              onClick={() => {
                setStep('verify');
                confirmMutation.reset();
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
