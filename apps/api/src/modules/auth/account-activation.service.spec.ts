import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AccountActivationService } from './account-activation.service';

function createService(
  redis: {
    get: ReturnType<typeof vi.fn>;
    setJson: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  },
  database: unknown = {},
) {
  return new AccountActivationService(database as never, {} as never, redis as never, {} as never);
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

describe('AccountActivationService activation expiry policy', () => {
  const redis = {
    get: vi.fn(),
    setJson: vi.fn(),
    delete: vi.fn(),
  };
  const service = createService(redis);
  const isActivationExpired = (
    service as unknown as {
      isActivationExpired: (expiresAt: Date | null, now?: Date) => boolean;
    }
  ).isActivationExpired.bind(service);
  const now = new Date('2026-08-13T00:00:00.000Z');

  it('keeps legacy activation codes without an expiry usable', () => {
    expect(isActivationExpired(null, now)).toBe(false);
  });

  it('keeps an activation code usable before its expiry', () => {
    expect(isActivationExpired(new Date('2026-08-13T00:00:00.001Z'), now)).toBe(false);
  });

  it('expires an activation code at its expiry boundary', () => {
    expect(isActivationExpired(new Date('2026-08-13T00:00:00.000Z'), now)).toBe(true);
  });

  it('applies the active school-year boundary to every identity type', () => {
    const assertActivationSchoolYear = (
      service as unknown as {
        assertActivationSchoolYear: (
          codeSchoolYear: number | null,
          activeSchoolYear: number,
        ) => void;
      }
    ).assertActivationSchoolYear.bind(service);

    expect(() => assertActivationSchoolYear(2025, 2026)).toThrowError(BadRequestException);
    expect(() => assertActivationSchoolYear(2026, 2026)).not.toThrow();
    expect(() => assertActivationSchoolYear(null, 2026)).not.toThrow();
  });

  it('blocks reissuing a used activation code even when force is requested', () => {
    const assertActivationIssueAllowed = (
      service as unknown as {
        assertActivationIssueAllowed: (
          activation: { usedAt: Date; expiresAt: Date | null; attemptCount: number },
          force: boolean,
        ) => void;
      }
    ).assertActivationIssueAllowed.bind(service);

    expect(() =>
      assertActivationIssueAllowed(
        { usedAt: new Date('2026-08-01T00:00:00.000Z'), expiresAt: null, attemptCount: 0 },
        true,
      ),
    ).toThrow(ConflictException);
  });

  it('rejects a forced issue request after the account was activated', async () => {
    const existingCode = {
      usedAt: new Date('2026-08-01T00:00:00.000Z'),
      expiresAt: null,
      attemptCount: 0,
    };
    const query = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
      for: vi.fn().mockResolvedValue([existingCode]),
    };
    query.from.mockReturnValue(query);
    query.where.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    const tx = { select: vi.fn().mockReturnValue(query), insert: vi.fn() };
    const database = {
      db: { transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) },
    };
    const issueService = createService(redis, database);
    vi.spyOn(
      issueService as unknown as { resolveActivationSchoolYear: () => Promise<number> },
      'resolveActivationSchoolYear',
    ).mockResolvedValue(2026);
    vi.spyOn(
      issueService as unknown as { lockActiveSchoolYear: () => Promise<number> },
      'lockActiveSchoolYear',
    ).mockResolvedValue(2026);

    await expect(
      issueService.issue({
        identityType: 'student',
        identityNumber: 2101,
        schoolYear: 2026,
        force: true,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ACCOUNT_ALREADY_ACTIVATED' }),
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('marks used codes as blocked from bulk reissuance', () => {
    const isActivationIssueBlocked = (
      service as unknown as {
        isActivationIssueBlocked: (activation: {
          usedAt: Date | null;
          expiresAt: Date | null;
          attemptCount: number;
        }) => boolean;
      }
    ).isActivationIssueBlocked.bind(service);

    expect(
      isActivationIssueBlocked({
        usedAt: new Date('2026-08-01T00:00:00.000Z'),
        expiresAt: null,
        attemptCount: 0,
      }),
    ).toBe(true);
  });
});
