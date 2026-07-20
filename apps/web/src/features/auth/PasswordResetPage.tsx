import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { confirmPasswordReset, getAuthErrorMessage, requestPasswordReset } from './api';
import '../../styles/auth.css';

type ResetStep = 'request' | 'confirm' | 'done';

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

export function PasswordResetPage() {
  const [step, setStep] = useState<ResetStep>('request');
  const [username, setUsername] = useState(initialUsername);
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
      setNotice('계정에 등록된 휴대폰 번호로 인증 코드를 보냈습니다.');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: confirmPasswordReset,
    onSuccess: () => {
      setStep('done');
      setConfirmationCode('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setValidationError(null);
      setNotice('비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.');
    },
  });

  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    setValidationError(null);
    requestMutation.mutate(username.trim());
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
    <section className="auth-page" aria-labelledby="password-reset-title">
      <section className="auth-panel">
        <Link to="/" className="auth-brand" aria-label="과구리 홈으로 이동">
          <img className="auth-brand-mark" src="/assets/lIcon.png" alt="" width="34" height="34" />
          <strong>과구리</strong>
        </Link>

        <header className="auth-heading">
          <h1 id="password-reset-title">
            {step === 'done' ? '비밀번호 변경 완료' : '비밀번호 찾기'}
          </h1>
          <p>
            {step === 'done'
              ? '새 비밀번호로 다시 로그인하면 됩니다.'
              : '계정에 등록된 휴대폰 번호로 본인 확인 코드를 전송합니다.'}
          </p>
        </header>

        {step === 'request' ? (
          <form className="auth-form" onSubmit={submitRequest}>
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
            {activeError ? <FormMessage>{activeError}</FormMessage> : null}
            <button className="auth-submit" type="submit" disabled={requestMutation.isPending}>
              {requestMutation.isPending ? '전송 중' : '인증 코드 받기'}
            </button>
            <Link className="auth-back-button" to="/login" search={{ returnTo: undefined }}>
              <ArrowLeft size={15} aria-hidden="true" /> 로그인으로 돌아가기
            </Link>
          </form>
        ) : null}

        {step === 'confirm' ? (
          <form className="auth-form" onSubmit={submitConfirm}>
            {notice ? <FormMessage success>{notice}</FormMessage> : null}
            <label htmlFor="confirmation-code">
              <span>인증 코드</span>
              <input
                id="confirmation-code"
                value={confirmationCode}
                onChange={(event) => setConfirmationCode(event.target.value.replace(/\s/g, ''))}
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="휴대폰으로 받은 코드를 입력하세요"
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
            <p className="auth-help">
              8자 이상으로 입력하고, 이름이나 학번과 다른 비밀번호를 사용하세요.
            </p>
            {activeError ? <FormMessage>{activeError}</FormMessage> : null}
            <div className="auth-inline-actions">
              <button
                className="auth-link-button"
                type="button"
                disabled={requestMutation.isPending}
                onClick={() => requestMutation.mutate(username.trim())}
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
              <ArrowLeft size={15} aria-hidden="true" /> 계정 다시 입력
            </button>
          </form>
        ) : null}

        {step === 'done' ? (
          <div className="auth-form">
            {notice ? <FormMessage success>{notice}</FormMessage> : null}
            <Link className="auth-submit" to="/login" search={{ returnTo: undefined }}>
              로그인하기
            </Link>
          </div>
        ) : null}
      </section>
    </section>
  );
}
