import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { env } from '../../shared/config/env';

type PasswordResetDeliveryInput = {
  code: string;
  phone: string;
};

type VerificationPurpose = 'account-activation' | 'contact-change';

type SendonResponse = {
  code?: number;
  message?: string;
  data?: {
    groupId?: string;
  };
};

function normalizeKoreanMobilePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/[^\d+]/g, '');

  if (/^\+8210\d{8}$/.test(normalized)) return `010${normalized.slice(5)}`;
  if (/^8210\d{8}$/.test(normalized)) return `010${normalized.slice(4)}`;
  if (/^10\d{8}$/.test(normalized)) return `0${normalized}`;
  if (/^010\d{8}$/.test(normalized)) return normalized;
  return null;
}

@Injectable()
export class SendonPasswordResetService {
  private readonly logger = new Logger(SendonPasswordResetService.name);

  async sendPasswordResetCode(input: PasswordResetDeliveryInput): Promise<void> {
    const phone = normalizeKoreanMobilePhone(input.phone);
    if (!phone) {
      throw new ServiceUnavailableException({
        code: 'AUTH_RECOVERY_UNAVAILABLE',
        message: '비밀번호 재설정에 사용할 전화번호를 확인해 주세요.',
      });
    }

    if (!env.SENDON_ACCOUNT_ID || !env.SENDON_API_KEY) {
      throw new ServiceUnavailableException({
        code: 'AUTH_RECOVERY_UNAVAILABLE',
        message: '비밀번호 재설정 발송 설정을 확인해 주세요.',
      });
    }

    if (env.SENDON_KAKAO_SEND_PROFILE_ID && env.SENDON_PASSWORD_RESET_TEMPLATE_ID) {
      await this.sendAlimTalk(phone, input.code);
      return;
    }

    if (env.SENDON_SMS_SENDER_NUMBER) {
      await this.sendSms(phone, input.code);
      return;
    }

    throw new ServiceUnavailableException({
      code: 'AUTH_RECOVERY_UNAVAILABLE',
      message: '비밀번호 재설정 발송 채널을 확인해 주세요.',
    });
  }

  async sendVerificationCode(
    input: PasswordResetDeliveryInput & { purpose: VerificationPurpose },
  ): Promise<void> {
    const phone = normalizeKoreanMobilePhone(input.phone);
    if (!phone) {
      throw new ServiceUnavailableException({
        code: 'AUTH_RECOVERY_UNAVAILABLE',
        message: '인증에 사용할 전화번호를 확인해 주세요.',
      });
    }
    if (!env.SENDON_ACCOUNT_ID || !env.SENDON_API_KEY) {
      throw new ServiceUnavailableException({
        code: 'AUTH_RECOVERY_UNAVAILABLE',
        message: '전화번호 인증 발송 설정을 확인해 주세요.',
      });
    }

    const templateId =
      input.purpose === 'account-activation'
        ? env.SENDON_ACCOUNT_ACTIVATION_TEMPLATE_ID
        : env.SENDON_CONTACT_VERIFICATION_TEMPLATE_ID;
    if (env.SENDON_KAKAO_SEND_PROFILE_ID && templateId) {
      await this.sendVerificationAlimTalk(phone, input.code, templateId);
      return;
    }
    if (env.SENDON_SMS_SENDER_NUMBER) {
      await this.sendSms(phone, input.code, this.verificationMessage(input.code));
      return;
    }
    throw new ServiceUnavailableException({
      code: 'AUTH_RECOVERY_UNAVAILABLE',
      message: '전화번호 인증 발송 채널을 확인해 주세요.',
    });
  }

  async sendContactChangedNotice(input: {
    phone: string;
    field: 'email' | 'phone';
  }): Promise<void> {
    const phone = normalizeKoreanMobilePhone(input.phone);
    if (!phone || !env.SENDON_ACCOUNT_ID || !env.SENDON_API_KEY) {
      throw new ServiceUnavailableException({
        code: 'CONTACT_NOTIFICATION_UNAVAILABLE',
        message: '전화번호 변경 알림 발송 설정을 확인해 주세요.',
      });
    }

    const message = this.contactChangedMessage(input.field);
    if (env.SENDON_KAKAO_SEND_PROFILE_ID && env.SENDON_CONTACT_CHANGED_TEMPLATE_ID) {
      await this.sendContactChangedAlimTalk(phone, message);
      return;
    }
    if (env.SENDON_SMS_SENDER_NUMBER) {
      await this.sendNoticeSms(phone, message);
      return;
    }
    throw new ServiceUnavailableException({
      code: 'CONTACT_NOTIFICATION_UNAVAILABLE',
      message: '전화번호 변경 알림 발송 채널을 확인해 주세요.',
    });
  }

  private async sendAlimTalk(phone: string, code: string): Promise<void> {
    await this.send('/v2/messages/kakao/alim-talk', {
      sendProfileId: env.SENDON_KAKAO_SEND_PROFILE_ID,
      templateId: env.SENDON_PASSWORD_RESET_TEMPLATE_ID,
      to: [
        {
          phone,
          variables: {
            '#{인증번호}': code,
          },
        },
      ],
      fallback: env.SENDON_SMS_SENDER_NUMBER
        ? {
            fallbackType: 'CUSTOM',
            custom: {
              type: 'SMS',
              senderNumber: env.SENDON_SMS_SENDER_NUMBER,
              message: this.passwordResetMessage(code),
              isAd: false,
            },
          }
        : { fallbackType: 'NONE' },
      useCredit: true,
    });
  }

  private async sendVerificationAlimTalk(
    phone: string,
    code: string,
    templateId: string,
  ): Promise<void> {
    await this.send('/v2/messages/kakao/alim-talk', {
      sendProfileId: env.SENDON_KAKAO_SEND_PROFILE_ID,
      templateId,
      to: [{ phone, variables: { '#{인증번호}': code } }],
      fallback: env.SENDON_SMS_SENDER_NUMBER
        ? {
            fallbackType: 'CUSTOM',
            custom: {
              type: 'SMS',
              senderNumber: env.SENDON_SMS_SENDER_NUMBER,
              message: this.verificationMessage(code),
              isAd: false,
            },
          }
        : { fallbackType: 'NONE' },
      useCredit: true,
    });
  }

  private async sendContactChangedAlimTalk(phone: string, message: string): Promise<void> {
    await this.send('/v2/messages/kakao/alim-talk', {
      sendProfileId: env.SENDON_KAKAO_SEND_PROFILE_ID,
      templateId: env.SENDON_CONTACT_CHANGED_TEMPLATE_ID,
      to: [{ phone, variables: {} }],
      fallback: env.SENDON_SMS_SENDER_NUMBER
        ? {
            fallbackType: 'CUSTOM',
            custom: {
              type: 'SMS',
              senderNumber: env.SENDON_SMS_SENDER_NUMBER,
              message,
              isAd: false,
            },
          }
        : { fallbackType: 'NONE' },
      useCredit: true,
    });
  }

  private async sendSms(
    phone: string,
    code: string,
    message = this.passwordResetMessage(code),
  ): Promise<void> {
    await this.send('/v2/messages/sms', {
      type: 'SMS',
      from: env.SENDON_SMS_SENDER_NUMBER,
      to: [phone],
      message,
      isAd: false,
      useCredit: true,
    });
  }

  private async sendNoticeSms(phone: string, message: string): Promise<void> {
    await this.send('/v2/messages/sms', {
      type: 'SMS',
      from: env.SENDON_SMS_SENDER_NUMBER,
      to: [phone],
      message,
      isAd: false,
      useCredit: true,
    });
  }

  private passwordResetMessage(code: string): string {
    return `[과구리] 인증번호 ${code}`;
  }

  private verificationMessage(code: string): string {
    return `[전남과학고등학교 전산시스템] 전화번호 인증번호는 ${code}입니다.`;
  }

  private contactChangedMessage(field: 'email' | 'phone'): string {
    const label = field === 'email' ? '이메일' : '전화번호';
    return `[전남과학고등학교 전산시스템] 등록된 ${label}가 변경되었습니다. 본인이 변경하지 않았다면 학교 담당자에게 문의해 주세요.`;
  }

  private async send(path: string, body: unknown): Promise<void> {
    let response: Response;
    let payload: SendonResponse;

    try {
      response = await fetch(`${env.SENDON_API_BASE_URL.replace(/\/+$/, '')}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(
            `${env.SENDON_ACCOUNT_ID}:${env.SENDON_API_KEY}`,
          ).toString('base64')}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(env.SENDON_REQUEST_TIMEOUT_MS),
      });
      payload = (await response.json().catch(() => ({}))) as SendonResponse;
    } catch (error) {
      this.logger.warn(
        `Sendon password reset delivery unavailable: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ServiceUnavailableException({
        code: 'AUTH_RECOVERY_DELIVERY_FAILED',
        message: '인증 코드 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }

    if (!response.ok || (typeof payload.code === 'number' && payload.code >= 400)) {
      this.logger.warn(
        `Sendon password reset delivery failed: status=${response.status} code=${
          payload.code ?? 'unknown'
        } message=${payload.message ?? 'unknown'}`,
      );
      throw new ServiceUnavailableException({
        code: 'AUTH_RECOVERY_DELIVERY_FAILED',
        message: '인증 코드 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }
  }
}
