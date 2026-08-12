import type { FormEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { AccountActivationIdentityType, StudentGender } from '@jshsus/types';
import { ArrowLeft, Eye, EyeOff, LockKeyhole, X } from 'lucide-react';
import { useToast } from '../../components/feedback/Toast';
import {
  completeAccountActivation,
  getAuthErrorMessage,
  lookupAccountActivation,
  requestAccountActivationEmailVerification,
  requestAccountActivationPhoneVerification,
  verifyAccountActivationEmailVerification,
  verifyAccountActivationPhoneVerification,
} from './api';
import { AuthLayout } from './AuthLayout';
import { AuthSelect } from './AuthSelect';

function PasswordField(props: {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  placeholder: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string | null;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-form-field">
      <label htmlFor={props.id}>{props.label}</label>
      <div className="auth-password-field">
        <LockKeyhole className="auth-field-icon" size={17} aria-hidden="true" />
        <input
          id={props.id}
          className={props.error ? 'auth-input-invalid' : undefined}
          type={visible ? 'text' : 'password'}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          onBlur={props.onBlur}
          autoComplete={props.autoComplete}
          placeholder={props.placeholder}
          required
          aria-invalid={Boolean(props.error)}
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
      <FieldError message={props.error} />
    </div>
  );
}

function FieldError({ message }: { message?: string | null }) {
  return (
    <p
      className={`auth-field-error${message ? ' is-visible' : ''}`}
      role={message ? 'alert' : undefined}
      aria-live="polite"
    >
      {message ?? '\u00a0'}
    </p>
  );
}

function FormMessage({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return (
    <p className={success ? 'auth-message auth-message-success' : 'auth-error'} role="status">
      {children}
    </p>
  );
}

type VerificationTarget = 'email' | 'phone';

function VerificationDialog({
  target,
  destination,
  code,
  expiresAt,
  pending,
  error,
  onCodeChange,
  onClose,
  onResend,
  onConfirm,
}: {
  target: VerificationTarget;
  destination: string;
  code: string;
  expiresAt: number;
  pending: boolean;
  error: string | null;
  onCodeChange: (value: string) => void;
  onClose: () => void;
  onResend: () => void;
  onConfirm: () => void;
}) {
  const [remaining, setRemaining] = useState(() => Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(Math.max(0, expiresAt - Date.now()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000)
    .toString()
    .padStart(2, '0');
  const label = target === 'email' ? '이메일' : '전화번호';

  return (
    <div
      className="auth-verification-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="auth-verification-modal__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-verification-title"
      >
        <header className="auth-verification-modal__header">
          <div>
            <p className="auth-verification-modal__eyebrow">{label} 인증</p>
            <h2 id="auth-verification-title">인증번호를 입력해 주세요</h2>
          </div>
          <button
            type="button"
            className="auth-verification-modal__close"
            aria-label="닫기"
            onClick={onClose}
          >
            <X size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>
        <p className="auth-verification-modal__description">
          <strong>{destination}</strong>로 발송된 6자리 인증번호를 입력해 주세요.
        </p>
        <form
          className="auth-verification-modal__form"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          <div className="auth-verification-modal__code-field">
            <input
              autoFocus
              className={error ? 'auth-input-invalid' : undefined}
              value={code}
              onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="인증번호 6자리"
              aria-label={`${label} 인증번호`}
              aria-invalid={Boolean(error)}
            />
            <span aria-live="polite">{remaining > 0 ? `${minutes}:${seconds}` : '만료됨'}</span>
          </div>
          <FieldError message={error} />
          <button type="button" className="auth-verification-modal__resend" onClick={onResend}>
            인증번호를 못 받으셨나요? <strong>재전송</strong>
          </button>
          <div className="auth-verification-modal__actions">
            <button type="button" className="auth-verification-modal__cancel" onClick={onClose}>
              취소
            </button>
            <button
              type="submit"
              className="auth-submit"
              disabled={pending || remaining <= 0 || !/^\d{6}$/.test(code)}
            >
              {pending ? '확인 중' : '완료'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function normalizedPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 && digits.startsWith('10') ? `0${digits}` : digits;
}

function initialReturnTo() {
  if (typeof window === 'undefined') return undefined;
  const value = new URLSearchParams(window.location.search).get('returnTo');
  return value?.startsWith('/') && !value.startsWith('//') ? value : undefined;
}

export function AccountActivationPage() {
  const { showToast } = useToast();
  const loginReturnHref = initialReturnTo() ?? '/login';
  const loginSearch = { returnTo: loginReturnHref === '/login' ? undefined : loginReturnHref };
  const [activationCode, setActivationCode] = useState('');
  const [identity, setIdentity] = useState<{
    identityType: AccountActivationIdentityType;
    identityNumber: number;
    name?: string;
    schoolYear?: number;
  } | null>(null);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<StudentGender | ''>('');
  const [email, setEmail] = useState('');
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [phoneVerificationCode, setPhoneVerificationCode] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneFieldError, setPhoneFieldError] = useState<string | null>(null);
  const [verificationTarget, setVerificationTarget] = useState<VerificationTarget | null>(null);
  const [verificationExpiresAt, setVerificationExpiresAt] = useState(0);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const lookupMutation = useMutation({
    mutationFn: lookupAccountActivation,
    onSuccess: (result) => {
      setIdentity({
        identityType: result.identityType,
        identityNumber: result.identityNumber,
        name: result.name,
        schoolYear: result.schoolYear,
      });
      setName(result.name ?? '');
      setValidationError(null);
    },
  });

  const phoneMutation = useMutation({
    mutationFn: requestAccountActivationPhoneVerification,
    onSuccess: () => {
      setPhoneVerificationCode('');
      setPhoneVerified(false);
      setVerificationTarget('phone');
      setVerificationExpiresAt(Date.now() + 300_000);
      setPhoneFieldError(null);
      setValidationError(null);
    },
  });

  const emailMutation = useMutation({
    mutationFn: requestAccountActivationEmailVerification,
    onSuccess: () => {
      setEmailVerificationCode('');
      setEmailVerified(false);
      setVerificationTarget('email');
      setVerificationExpiresAt(Date.now() + 300_000);
      setEmailFieldError(null);
      setValidationError(null);
    },
  });

  const activationMutation = useMutation({ mutationFn: completeAccountActivation });
  const phoneVerificationMutation = useMutation({
    mutationFn: verifyAccountActivationPhoneVerification,
    onSuccess: () => {
      setPhoneVerified(true);
      setPhoneFieldError(null);
      setVerificationTarget(null);
      showToast({ title: '전화번호 인증이 완료되었습니다.', tone: 'success' });
    },
  });
  const emailVerificationMutation = useMutation({
    mutationFn: verifyAccountActivationEmailVerification,
    onSuccess: () => {
      setEmailVerified(true);
      setEmailFieldError(null);
      setVerificationTarget(null);
      showToast({ title: '이메일 인증이 완료되었습니다.', tone: 'success' });
    },
  });

  const submitLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);
    lookupMutation.mutate({ activationCode: activationCode.trim() });
  };

  const requestPhoneCode = () => {
    const normalized = normalizedPhone(phone);
    if (!/^010\d{8}$/.test(normalized)) {
      setPhoneFieldError('전화번호를 확인해 주세요.');
      setValidationError(null);
      return;
    }
    setPhoneFieldError(null);
    setValidationError(null);
    phoneMutation.mutate({ activationCode: activationCode.trim(), phone: normalized });
  };

  const requestEmailCode = () => {
    const normalized = email.trim().toLocaleLowerCase('en-US');
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      setEmailFieldError('이메일 주소를 확인해 주세요.');
      setValidationError(null);
      return;
    }
    setEmailFieldError(null);
    setValidationError(null);
    emailMutation.mutate({ activationCode: activationCode.trim(), email: normalized });
  };

  const verifyCode = () => {
    if (
      !verificationTarget ||
      !/^\d{6}$/.test(
        verificationTarget === 'email' ? emailVerificationCode : phoneVerificationCode,
      )
    ) {
      return;
    }
    if (verificationTarget === 'email') {
      emailVerificationMutation.mutate({
        activationCode: activationCode.trim(),
        email: email.trim().toLocaleLowerCase('en-US'),
        verificationCode: emailVerificationCode,
      });
      return;
    }
    phoneVerificationMutation.mutate({
      activationCode: activationCode.trim(),
      phone: normalizedPhone(phone),
      verificationCode: phoneVerificationCode,
    });
  };

  const passwordPolicyError =
    (passwordTouched || submitAttempted) && !/^(?=.*[A-Za-z])(?=.*\d).{8,256}$/.test(password)
      ? '영문, 숫자 포함 8자 이상 입력해 주세요.'
      : null;
  const passwordConfirmError =
    passwordConfirm.length > 0 && password !== passwordConfirm
      ? '비밀번호가 일치하지 않습니다.'
      : null;

  const submitActivation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!identity) return;
    setSubmitAttempted(true);
    if (!gender) {
      setValidationError('성별을 선택해 주세요.');
      return;
    }
    if (identity.identityType === 'staff' && !name.trim()) {
      setValidationError('이름을 입력해 주세요.');
      return;
    }
    if (!phoneVerified) {
      setPhoneFieldError('전화번호 인증을 완료해 주세요.');
      setValidationError(null);
      return;
    }
    if (!emailVerified) {
      setEmailFieldError('이메일 인증을 완료해 주세요.');
      setValidationError(null);
      return;
    }
    if (passwordPolicyError) {
      setValidationError(passwordPolicyError);
      return;
    }
    if (passwordConfirmError) {
      setValidationError(passwordConfirmError);
      return;
    }

    setValidationError(null);
    activationMutation.mutate({
      ...identity,
      activationCode: activationCode.trim(),
      ...(identity.identityType === 'staff' ? { name: name.trim() } : {}),
      gender,
      email,
      phone: normalizedPhone(phone),
      phoneVerificationCode,
      emailVerificationCode,
      password,
    });
  };

  const resetLookup = () => {
    setIdentity(null);
    setPhoneVerificationCode('');
    setPhoneVerified(false);
    setPhoneFieldError(null);
    setEmailVerificationCode('');
    setEmailVerified(false);
    setEmailFieldError(null);
    setVerificationTarget(null);
    setPasswordTouched(false);
    setSubmitAttempted(false);
    setValidationError(null);
    lookupMutation.reset();
    phoneMutation.reset();
    emailMutation.reset();
    activationMutation.reset();
  };

  const emailRequestError = emailMutation.isError
    ? getAuthErrorMessage(emailMutation.error, '이메일 인증번호를 보내지 못했습니다.')
    : null;
  const phoneRequestError = phoneMutation.isError
    ? getAuthErrorMessage(phoneMutation.error, '전화번호 인증번호를 보내지 못했습니다.')
    : null;
  const emailError = emailFieldError ?? emailRequestError;
  const phoneError = phoneFieldError ?? phoneRequestError;
  const error =
    validationError ??
    (lookupMutation.isError
      ? getAuthErrorMessage(lookupMutation.error, '인증코드를 확인해 주세요.')
      : activationMutation.isError
        ? getAuthErrorMessage(activationMutation.error, '계정을 생성하지 못했습니다.')
        : null);

  return (
    <AuthLayout active="activation" title="통합로그인 계정 생성">
      {activationMutation.isSuccess ? (
        <div className="auth-form">
          <FormMessage success>계정이 생성되었습니다. 설정하신 정보로 로그인해 주세요.</FormMessage>
          <Link
            className="auth-submit"
            to="/login"
            search={{ sso: undefined, returnTo: undefined }}
          >
            로그인하기
          </Link>
        </div>
      ) : !identity ? (
        <form className="auth-form" onSubmit={submitLookup}>
          <label htmlFor="activation-code">
            <span>인증코드</span>
            <input
              id="activation-code"
              value={activationCode}
              onChange={(event) => setActivationCode(event.target.value.toUpperCase())}
              autoComplete="one-time-code"
              placeholder="학교에서 받은 인증코드를 입력해주세요."
              autoFocus
              required
            />
          </label>
          {error ? <FormMessage>{error}</FormMessage> : null}
          <button className="auth-submit" type="submit" disabled={lookupMutation.isPending}>
            {lookupMutation.isPending ? '확인 중' : '다음'}
          </button>
          <Link className="auth-back-button" to="/login" search={loginSearch}>
            <ArrowLeft size={15} aria-hidden="true" /> 로그인으로 돌아가기
          </Link>
        </form>
      ) : (
        <form className="auth-form" onSubmit={submitActivation}>
          <div className="auth-form-grid three">
            <label htmlFor="activation-identity-number">
              <span>{identity.identityType === 'student' ? '학번' : '교사번호'}</span>
              <input
                id="activation-identity-number"
                value={identity.identityNumber}
                autoComplete="username"
                disabled
              />
            </label>
            <label htmlFor="activation-name">
              <span>이름</span>
              <input
                id="activation-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                placeholder={
                  identity.identityType === 'student'
                    ? '명단에 등록된 이름'
                    : '이름을 입력해주세요.'
                }
                readOnly={identity.identityType === 'student'}
                disabled={identity.identityType === 'student'}
                required={identity.identityType === 'staff'}
              />
            </label>
            <label htmlFor="activation-gender">
              <span>성별</span>
              <AuthSelect
                id="activation-gender"
                value={gender}
                onChange={setGender}
                placeholder="성별 선택"
                options={[
                  { value: 'male', label: '남' },
                  { value: 'female', label: '여' },
                ]}
                required
              />
            </label>
          </div>
          <label htmlFor="activation-email">
            <span>이메일</span>
            <span className="auth-verification-field">
              <input
                id="activation-email"
                type="email"
                className={emailError ? 'auth-input-invalid' : undefined}
                value={email}
                disabled={emailVerified}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailVerificationCode('');
                  setEmailVerified(false);
                  setEmailFieldError(null);
                }}
                autoComplete="email"
                placeholder="이메일을 입력해주세요."
                required
                aria-invalid={Boolean(emailError)}
              />
              <button
                type="button"
                onClick={requestEmailCode}
                disabled={emailMutation.isPending || emailVerified}
              >
                인증
              </button>
            </span>
            <FieldError message={emailError} />
          </label>
          <label htmlFor="activation-phone">
            <span>전화번호</span>
            <span className="auth-verification-field">
              <input
                id="activation-phone"
                className={phoneError ? 'auth-input-invalid' : undefined}
                value={phone}
                disabled={phoneVerified}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setPhoneVerificationCode('');
                  setPhoneVerified(false);
                  setPhoneFieldError(null);
                }}
                autoComplete="tel"
                inputMode="tel"
                placeholder="전화번호를 입력해주세요."
                required
                aria-invalid={Boolean(phoneError)}
              />
              <button
                type="button"
                onClick={requestPhoneCode}
                disabled={phoneMutation.isPending || phoneVerified}
              >
                인증
              </button>
            </span>
            <FieldError message={phoneError} />
          </label>
          <PasswordField
            id="activation-password"
            label="비밀번호"
            value={password}
            onChange={setPassword}
            onBlur={() => setPasswordTouched(true)}
            error={passwordPolicyError}
            autoComplete="new-password"
            placeholder="비밀번호를 입력해주세요."
          />
          <PasswordField
            id="activation-password-confirm"
            label="비밀번호 확인"
            value={passwordConfirm}
            onChange={setPasswordConfirm}
            error={passwordConfirmError}
            autoComplete="new-password"
            placeholder="비밀번호를 다시 입력해주세요."
          />
          {error ? <FormMessage>{error}</FormMessage> : null}
          <button className="auth-submit" type="submit" disabled={activationMutation.isPending}>
            {activationMutation.isPending ? '계정 생성 중' : '계정 만들기'}
          </button>
          <button className="auth-back-button" type="button" onClick={resetLookup}>
            <ArrowLeft size={15} aria-hidden="true" /> 이전으로
          </button>
        </form>
      )}
      {verificationTarget ? (
        <VerificationDialog
          target={verificationTarget}
          destination={verificationTarget === 'email' ? email : phone}
          code={verificationTarget === 'email' ? emailVerificationCode : phoneVerificationCode}
          expiresAt={verificationExpiresAt}
          pending={
            verificationTarget === 'email'
              ? emailVerificationMutation.isPending
              : phoneVerificationMutation.isPending
          }
          error={
            verificationTarget === 'email'
              ? emailVerificationMutation.isError
                ? getAuthErrorMessage(
                    emailVerificationMutation.error,
                    '이메일 인증번호를 확인해 주세요.',
                  )
                : null
              : phoneVerificationMutation.isError
                ? getAuthErrorMessage(
                    phoneVerificationMutation.error,
                    '전화번호 인증번호를 확인해 주세요.',
                  )
                : null
          }
          onCodeChange={(value) => {
            if (verificationTarget === 'email') setEmailVerificationCode(value);
            else setPhoneVerificationCode(value);
          }}
          onClose={() => setVerificationTarget(null)}
          onResend={verificationTarget === 'email' ? requestEmailCode : requestPhoneCode}
          onConfirm={verifyCode}
        />
      ) : null}
    </AuthLayout>
  );
}
