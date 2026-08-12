import { describe, expect, it, vi } from 'vitest';
import { AccountActivationService } from './account-activation.service';

function createService(redis: {
  get: ReturnType<typeof vi.fn>;
  setJson: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}) {
  return new AccountActivationService(
    {} as never,
    {} as never,
    redis as never,
    {} as never,
    {} as never,
  );
}

describe('AccountActivationService verification flow', () => {
  it('keeps a successfully verified phone flow for account completion', async () => {
    const redis = {
      get: vi.fn(),
      setJson: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const service = createService(redis);
    const activationCode = 'PHONE-TEST';
    const phone = '01012345678';
    const verificationCode = '123456';
    const flowKey = (
      service as unknown as { phoneVerificationFlowKey: (value: string) => string }
    ).phoneVerificationFlowKey(activationCode);
    const codeHash = (
      service as unknown as {
        hashPhoneVerificationCode: (flowKey: string, phone: string, code: string) => string;
      }
    ).hashPhoneVerificationCode(flowKey, phone, verificationCode);

    redis.get.mockResolvedValue(
      JSON.stringify({
        identityType: 'student',
        identityNumber: 2101,
        phone,
        codeHash,
        attemptCount: 0,
      }),
    );
    vi.spyOn(
      service as unknown as { findAvailableActivation: () => Promise<unknown> },
      'findAvailableActivation',
    ).mockResolvedValue({ identityType: 'student', identityNumber: 2101 });

    await expect(
      service.verifyPhoneVerification({ activationCode, phone, verificationCode }),
    ).resolves.toEqual({ ok: true });

    expect(redis.setJson).toHaveBeenCalledWith(
      flowKey,
      expect.objectContaining({ verified: true }),
      300,
    );
  });

  it('keeps a successfully verified email flow for account completion', async () => {
    const redis = {
      get: vi.fn(),
      setJson: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const service = createService(redis);
    const activationCode = 'EMAIL-TEST';
    const email = 'student@example.com';
    const verificationCode = '654321';
    const flowKey = (
      service as unknown as { emailVerificationFlowKey: (value: string) => string }
    ).emailVerificationFlowKey(activationCode);
    const codeHash = (
      service as unknown as {
        hashVerificationCode: (flowKey: string, email: string, code: string) => string;
      }
    ).hashVerificationCode(flowKey, email, verificationCode);

    redis.get.mockResolvedValue(
      JSON.stringify({
        identityType: 'student',
        identityNumber: 2101,
        email,
        codeHash,
        attemptCount: 0,
      }),
    );
    vi.spyOn(
      service as unknown as { findAvailableActivation: () => Promise<unknown> },
      'findAvailableActivation',
    ).mockResolvedValue({ identityType: 'student', identityNumber: 2101 });

    await expect(
      service.verifyEmailVerification({ activationCode, email, verificationCode }),
    ).resolves.toEqual({ ok: true });

    expect(redis.setJson).toHaveBeenCalledWith(
      flowKey,
      expect.objectContaining({ verified: true }),
      300,
    );
  });
});
