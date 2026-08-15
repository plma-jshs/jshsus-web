import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';

const OTP_LENGTH = 6;

export function OtpInput({
  value,
  onChange,
  onComplete,
  error = false,
  disabled = false,
  label = '인증번호',
  autoFocus = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
  label?: string;
  autoFocus?: boolean;
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const lastCompletedValue = useRef<string | null>(null);
  const shakeTimeout = useRef<number | undefined>(undefined);
  const [isShaking, setIsShaking] = useState(false);
  const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH);

  const focusInput = (index: number) => {
    inputRefs.current[Math.max(0, Math.min(index, OTP_LENGTH - 1))]?.focus();
  };

  useEffect(() => {
    if (!autoFocus || disabled) return undefined;
    const frame = window.requestAnimationFrame(() => focusInput(0));
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, disabled]);

  useEffect(() => {
    if (!error) return undefined;
    const frame = window.requestAnimationFrame(() => setIsShaking(true));
    if (shakeTimeout.current) window.clearTimeout(shakeTimeout.current);
    shakeTimeout.current = window.setTimeout(() => setIsShaking(false), 460);
    return () => {
      window.cancelAnimationFrame(frame);
      if (shakeTimeout.current) window.clearTimeout(shakeTimeout.current);
    };
  }, [error]);

  useEffect(() => {
    return () => {
      if (shakeTimeout.current) window.clearTimeout(shakeTimeout.current);
    };
  }, []);

  const commit = (nextValue: string, focusIndex?: number) => {
    const next = nextValue.replace(/\D/g, '').slice(0, OTP_LENGTH);
    onChange(next);
    if (next.length < OTP_LENGTH) lastCompletedValue.current = null;
    if (next.length === OTP_LENGTH && next !== lastCompletedValue.current) {
      lastCompletedValue.current = next;
      onComplete?.(next);
    }
    if (focusIndex !== undefined) focusInput(focusIndex);
  };

  const handleChange = (index: number, rawValue: string) => {
    const entered = rawValue.replace(/\D/g, '');
    if (entered.length > 1) {
      const nextDigits = digits.split('');
      entered
        .slice(0, OTP_LENGTH - index)
        .split('')
        .forEach((digit, offset) => {
          nextDigits[index + offset] = digit;
        });
      commit(nextDigits.join('').slice(0, OTP_LENGTH), OTP_LENGTH - 1);
      return;
    }
    const nextDigit = entered.slice(-1);
    const nextDigits = digits.split('');
    nextDigits[index] = nextDigit;
    commit(nextDigits.join(''), nextDigit ? index + 1 : index);
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    const nextDigits = digits.split('');
    pasted
      .slice(0, OTP_LENGTH - index)
      .split('')
      .forEach((digit, offset) => {
        nextDigits[index + offset] = digit;
      });
    const next = nextDigits.join('').slice(0, OTP_LENGTH);
    commit(next, Math.min(index + pasted.length, OTP_LENGTH - 1));
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusInput(index - 1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusInput(index + 1);
      return;
    }
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      const nextDigits = digits.split('');
      nextDigits[index - 1] = '';
      commit(nextDigits.join(''), index - 1);
    }
  };

  return (
    <div
      className={`auth-otp${error ? ' is-error' : ''}${isShaking ? ' is-shaking' : ''}`}
      role="group"
      aria-label={label}
    >
      {Array.from({ length: OTP_LENGTH }, (_, index) => (
        <input
          aria-label={`${label} ${index + 1}번째 자리`}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          className="auth-otp__input"
          disabled={disabled}
          inputMode="numeric"
          key={index}
          maxLength={1}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          type="text"
          value={digits[index] ?? ''}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
        />
      ))}
    </div>
  );
}
