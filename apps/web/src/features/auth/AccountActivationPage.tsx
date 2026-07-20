import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { AccountActivationIdentityType, StudentGender } from '@jshsus/types';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { completeAccountActivation, getAuthErrorMessage } from './api';
import '../../styles/auth.css';

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

function normalizedPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 && digits.startsWith('10') ? `0${digits}` : digits;
}

export function AccountActivationPage() {
  const [identityType, setIdentityType] = useState<AccountActivationIdentityType>('student');
  const [identityNumber, setIdentityNumber] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<StudentGender | ''>('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const activationMutation = useMutation({
    mutationFn: completeAccountActivation,
  });

  const submitActivation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numberValue = Number(identityNumber);
    if (!Number.isInteger(numberValue) || numberValue <= 0) {
      setValidationError('학번 또는 교사번호를 확인해 주세요.');
      return;
    }
    if (!gender) {
      setValidationError('성별을 선택해 주세요.');
      return;
    }
    if (password !== passwordConfirm) {
      setValidationError('비밀번호가 서로 일치하지 않습니다.');
      return;
    }

    setValidationError(null);
    activationMutation.mutate({
      identityType,
      identityNumber: numberValue,
      activationCode,
      name,
      gender,
      email,
      phone: normalizedPhone(phone),
      password,
    });
  };

  const error =
    validationError ??
    (activationMutation.isError
      ? getAuthErrorMessage(activationMutation.error, '계정을 생성하지 못했습니다.')
      : null);

  return (
    <section className="auth-page" aria-labelledby="account-activation-title">
      <section className="auth-panel">
        <Link to="/" className="auth-brand" aria-label="과구리 홈으로 이동">
          <img className="auth-brand-mark" src="/assets/lIcon.png" alt="" width="34" height="34" />
          <strong>과구리</strong>
        </Link>

        <header className="auth-heading">
          <h1 id="account-activation-title">통합로그인 계정 만들기</h1>
          <p>학교에서 받은 인증코드로 과구리 계정과 통합로그인을 연결합니다.</p>
        </header>

        {activationMutation.isSuccess ? (
          <div className="auth-form">
            <FormMessage success>
              계정을 만들었습니다. 학번 또는 교사번호와 설정한 비밀번호로 로그인해 주세요.
            </FormMessage>
            <Link className="auth-submit" to="/login" search={{ returnTo: undefined }} replace>
              로그인하기
            </Link>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submitActivation}>
            <label htmlFor="activation-type">
              <span>구분</span>
              <select
                id="activation-type"
                value={identityType}
                onChange={(event) =>
                  setIdentityType(event.currentTarget.value as AccountActivationIdentityType)
                }
                required
              >
                <option value="student">학생</option>
                <option value="staff">교직원</option>
              </select>
            </label>
            <label htmlFor="activation-identity-number">
              <span>{identityType === 'student' ? '학번' : '교사번호'}</span>
              <input
                id="activation-identity-number"
                value={identityNumber}
                onChange={(event) => setIdentityNumber(event.target.value.replace(/\D/g, ''))}
                autoComplete="username"
                inputMode="numeric"
                placeholder={identityType === 'student' ? '예: 1101' : '6자리 교사번호'}
                required
              />
            </label>
            <label htmlFor="activation-code">
              <span>인증코드</span>
              <input
                id="activation-code"
                value={activationCode}
                onChange={(event) => setActivationCode(event.target.value)}
                autoComplete="one-time-code"
                placeholder="예: ABCD-EFGH-JKLM"
                required
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
                  required
                />
              </label>
              <label htmlFor="activation-gender">
                <span>성별</span>
                <select
                  id="activation-gender"
                  value={gender}
                  onChange={(event) => setGender(event.currentTarget.value as StudentGender)}
                  required
                >
                  <option value="" disabled>
                    선택
                  </option>
                  <option value="male">남</option>
                  <option value="female">여</option>
                </select>
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
                placeholder="비밀번호 찾기에 사용할 이메일"
                required
              />
            </label>
            <label htmlFor="activation-phone">
              <span>휴대폰번호</span>
              <input
                id="activation-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                inputMode="tel"
                placeholder="01012345678"
                required
              />
            </label>
            <PasswordField
              id="activation-password"
              label="비밀번호"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder="8자 이상"
            />
            <PasswordField
              id="activation-password-confirm"
              label="비밀번호 확인"
              value={passwordConfirm}
              onChange={setPasswordConfirm}
              autoComplete="new-password"
              placeholder="비밀번호를 다시 입력하세요"
            />
            {error ? <FormMessage>{error}</FormMessage> : null}
            <button className="auth-submit" type="submit" disabled={activationMutation.isPending}>
              {activationMutation.isPending ? '계정 생성 중' : '계정 만들기'}
            </button>
            <Link className="auth-back-button" to="/login" search={{ returnTo: undefined }}>
              <ArrowLeft size={15} aria-hidden="true" /> 로그인으로 돌아가기
            </Link>
          </form>
        )}
      </section>
    </section>
  );
}
