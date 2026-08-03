import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { AccountActivationIdentityType, StudentGender } from '@jshsus/types';
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import {
  completeAccountActivation,
  getAuthErrorMessage,
  lookupAccountActivation,
  requestAccountActivationPhoneVerification,
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
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-form-field">
      <label htmlFor={props.id}>{props.label}</label>
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

function normalizedPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 && digits.startsWith('10') ? `0${digits}` : digits;
}

export function AccountActivationPage() {
  const [activationCode, setActivationCode] = useState('');
  const [identity, setIdentity] = useState<{
    identityType: AccountActivationIdentityType;
    identityNumber: number;
  } | null>(null);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<StudentGender | ''>('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneVerificationCode, setPhoneVerificationCode] = useState('');
  const [phoneCodeRequested, setPhoneCodeRequested] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const lookupMutation = useMutation({
    mutationFn: lookupAccountActivation,
    onSuccess: (result) => {
      setIdentity({ identityType: result.identityType, identityNumber: result.identityNumber });
      setValidationError(null);
    },
  });

  const phoneMutation = useMutation({
    mutationFn: requestAccountActivationPhoneVerification,
    onSuccess: () => {
      setPhoneCodeRequested(true);
      setPhoneVerificationCode('');
      setValidationError(null);
    },
  });

  const activationMutation = useMutation({ mutationFn: completeAccountActivation });

  const submitLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);
    lookupMutation.mutate({ activationCode: activationCode.trim() });
  };

  const requestPhoneCode = () => {
    const normalized = normalizedPhone(phone);
    if (!/^010\d{8}$/.test(normalized)) {
      setValidationError('전화번호를 확인해 주세요.');
      return;
    }
    setValidationError(null);
    phoneMutation.mutate({ activationCode: activationCode.trim(), phone: normalized });
  };

  const submitActivation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!identity) return;
    if (!gender) {
      setValidationError('성별을 선택해 주세요.');
      return;
    }
    if (!phoneCodeRequested || !/^\d{6}$/.test(phoneVerificationCode)) {
      setValidationError('전화번호 인증을 완료해 주세요.');
      return;
    }
    if (password !== passwordConfirm) {
      setValidationError('비밀번호가 서로 일치하지 않습니다.');
      return;
    }

    setValidationError(null);
    activationMutation.mutate({
      ...identity,
      activationCode: activationCode.trim(),
      name,
      gender,
      email,
      phone: normalizedPhone(phone),
      phoneVerificationCode,
      password,
    });
  };

  const resetLookup = () => {
    setIdentity(null);
    setPhoneCodeRequested(false);
    setPhoneVerificationCode('');
    setValidationError(null);
    lookupMutation.reset();
    phoneMutation.reset();
    activationMutation.reset();
  };

  const error =
    validationError ??
    (lookupMutation.isError
      ? getAuthErrorMessage(lookupMutation.error, '인증코드를 확인해 주세요.')
      : phoneMutation.isError
        ? getAuthErrorMessage(phoneMutation.error, '전화번호 인증번호를 보내지 못했습니다.')
        : activationMutation.isError
          ? getAuthErrorMessage(activationMutation.error, '계정을 생성하지 못했습니다.')
          : null);

  return (
    <AuthLayout active="activation" title="통합로그인 계정 생성">
      {activationMutation.isSuccess ? (
        <div className="auth-form">
          <FormMessage success>
            계정을 만들었습니다. 학번 또는 교사번호와 설정한 비밀번호로 로그인해 주세요.
          </FormMessage>
          <Link className="auth-submit" to="/login" search={{ returnTo: undefined }} replace>
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
          <Link className="auth-back-button" to="/login" search={{ returnTo: undefined }}>
            <ArrowLeft size={15} aria-hidden="true" /> 로그인으로 돌아가기
          </Link>
        </form>
      ) : (
        <form className="auth-form" onSubmit={submitActivation}>
          <label htmlFor="activation-identity-number">
            <span>{identity.identityType === 'student' ? '학번' : '교사번호'}</span>
            <input
              id="activation-identity-number"
              value={identity.identityNumber}
              autoComplete="username"
              disabled
            />
          </label>
          <div className="auth-form-grid two">
            <label htmlFor="activation-name">
              <span>이름</span>
              <input
                id="activation-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                placeholder="이름을 입력해주세요."
                required
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
            <input
              id="activation-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="이메일을 입력해주세요."
              required
            />
          </label>
          <label htmlFor="activation-phone">
            <span>전화번호</span>
            <span className="auth-verification-field">
              <input
                id="activation-phone"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setPhoneCodeRequested(false);
                  setPhoneVerificationCode('');
                }}
                autoComplete="tel"
                inputMode="tel"
                placeholder="전화번호를 입력해주세요."
                required
              />
              <button type="button" onClick={requestPhoneCode} disabled={phoneMutation.isPending}>
                {phoneMutation.isPending ? '전송 중' : phoneCodeRequested ? '재전송' : '인증'}
              </button>
            </span>
          </label>
          {phoneCodeRequested ? (
            <label htmlFor="activation-phone-code">
              <span>인증번호</span>
              <input
                id="activation-phone-code"
                value={phoneVerificationCode}
                onChange={(event) =>
                  setPhoneVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="6자리 인증번호를 입력해주세요."
                required
              />
            </label>
          ) : null}
          <PasswordField
            id="activation-password"
            label="비밀번호"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="비밀번호를 입력해주세요."
          />
          <PasswordField
            id="activation-password-confirm"
            label="비밀번호 확인"
            value={passwordConfirm}
            onChange={setPasswordConfirm}
            autoComplete="new-password"
            placeholder="비밀번호를 다시 입력해주세요."
          />
          {error ? <FormMessage>{error}</FormMessage> : null}
          <button className="auth-submit" type="submit" disabled={activationMutation.isPending}>
            {activationMutation.isPending ? '계정 생성 중' : '계정 만들기'}
          </button>
          <button className="auth-back-button" type="button" onClick={resetLookup}>
            <ArrowLeft size={15} aria-hidden="true" /> 다른 인증코드 입력
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
