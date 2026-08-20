import { Injectable } from '@nestjs/common';
import { EmailVerificationService, type VerificationPurpose } from './email-verification.service';
import { SendonPasswordResetService } from './sendon-password-reset.service';

export type AuthCodePurpose = VerificationPurpose;

export type AuthCodeDeliveryInput = {
  channel: 'phone' | 'email';
  code: string;
  purpose: AuthCodePurpose;
  phone?: string;
  email?: string;
};

/**
 * Auth owns the verification flow and code lifecycle. This facade owns only
 * the transport selection so the rest of the application does not depend on
 * Sendon or SES implementations directly.
 */
@Injectable()
export class AuthDeliveryService {
  constructor(
    private readonly sendon: SendonPasswordResetService,
    private readonly email: EmailVerificationService,
  ) {}

  sendPasswordResetCode(input: { phone: string; code: string }): Promise<void> {
    return this.sendon.sendPasswordResetCode(input);
  }

  sendVerificationCode(input: AuthCodeDeliveryInput): Promise<void> {
    if (input.channel === 'phone') {
      if (!input.phone) throw new Error('A phone number is required for phone delivery.');
      if (input.purpose === 'password-reset') {
        return this.sendon.sendPasswordResetCode({ phone: input.phone, code: input.code });
      }
      return this.sendon.sendVerificationCode({
        phone: input.phone,
        code: input.code,
        purpose: input.purpose,
      });
    }

    if (!input.email) throw new Error('An email address is required for email delivery.');
    return this.email.sendVerificationCode({
      email: input.email,
      code: input.code,
      purpose: input.purpose,
    });
  }

  sendContactChangedNotice(input: { email: string; field: 'email' | 'phone' }): Promise<void> {
    return this.email.sendContactChangedNotice(input);
  }
}
