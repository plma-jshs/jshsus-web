import { describe, expect, it, vi } from 'vitest';
import { AuthDeliveryService } from './auth-delivery.service';

describe('AuthDeliveryService', () => {
  it('routes password reset phone codes through the password reset transport', async () => {
    const sendon = {
      sendPasswordResetCode: vi.fn().mockResolvedValue(undefined),
      sendVerificationCode: vi.fn(),
    };
    const email = { sendVerificationCode: vi.fn(), sendContactChangedNotice: vi.fn() };
    const service = new AuthDeliveryService(sendon as never, email as never);

    await service.sendVerificationCode({
      channel: 'phone',
      phone: '01012345678',
      code: '123456',
      purpose: 'password-reset',
    });

    expect(sendon.sendPasswordResetCode).toHaveBeenCalledWith({
      phone: '01012345678',
      code: '123456',
    });
    expect(sendon.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('routes email codes and contact notices through the email transport', async () => {
    const sendon = { sendPasswordResetCode: vi.fn(), sendVerificationCode: vi.fn() };
    const email = {
      sendVerificationCode: vi.fn().mockResolvedValue(undefined),
      sendContactChangedNotice: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AuthDeliveryService(sendon as never, email as never);

    await service.sendVerificationCode({
      channel: 'email',
      email: 'student@example.com',
      code: '123456',
      purpose: 'account-activation',
    });
    await service.sendContactChangedNotice({ email: 'student@example.com', field: 'phone' });

    expect(email.sendVerificationCode).toHaveBeenCalledWith({
      email: 'student@example.com',
      code: '123456',
      purpose: 'account-activation',
    });
    expect(email.sendContactChangedNotice).toHaveBeenCalledWith({
      email: 'student@example.com',
      field: 'phone',
    });
  });
});
