import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { env } from '../../shared/config/env';

type PasswordResetDeliveryInput = {
  code: string;
  phone: string;
};

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
        message: '비밀번호 재설정에 사용할 휴대폰 번호를 확인해 주세요.',
      });
    }

    if (!env.SENDON_API_KEY) {
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

  private async sendSms(phone: string, code: string): Promise<void> {
    await this.send('/v2/messages/sms', {
      type: 'SMS',
      from: env.SENDON_SMS_SENDER_NUMBER,
      to: [phone],
      message: this.passwordResetMessage(code),
      isAd: false,
      useCredit: true,
    });
  }

  private passwordResetMessage(code: string): string {
    return `[과구리] 인증번호 ${code}`;
  }

  private async send(path: string, body: unknown): Promise<void> {
    let response: Response;
    let payload: SendonResponse;

    try {
      response = await fetch(`${env.SENDON_API_BASE_URL.replace(/\/+$/, '')}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(
            `${env.SENDON_ACCOUNT_ID || env.SENDON_API_KEY}:${
              env.SENDON_ACCOUNT_ID ? env.SENDON_API_KEY : ''
            }`,
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
