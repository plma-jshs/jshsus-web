import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { env } from '../../shared/config/env';

type VerificationPurpose = 'account-activation' | 'contact-change';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly client = new SESv2Client({
    region: env.SES_REGION,
    credentials: env.COGNITO_AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: env.COGNITO_AWS_ACCESS_KEY_ID,
          secretAccessKey: env.COGNITO_AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });

  async sendVerificationCode(input: {
    email: string;
    code: string;
    purpose: VerificationPurpose;
  }): Promise<void> {
    if (!env.SES_FROM_EMAIL) {
      throw new ServiceUnavailableException({
        code: 'EMAIL_DELIVERY_NOT_CONFIGURED',
        message: '이메일 인증 발송 설정을 확인해 주세요.',
      });
    }

    const title = input.purpose === 'account-activation' ? '계정 생성' : '이메일 변경';
    const code = escapeHtml(input.code);
    await this.sendEmail({
      to: input.email,
      subject: `[전남과학고 전산시스템] ${title} 인증번호`,
      text: `${title} 인증번호는 ${input.code}입니다. 인증번호는 5분 동안 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.`,
      html: `<!doctype html><html lang="ko"><body style="margin:0;background:#f4f7f8;font-family:Arial,'Noto Sans KR',sans-serif;color:#172033"><div style="max-width:520px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dce4e7"><p style="margin:0 0 20px;color:#667085;font-size:14px">전남과학고등학교 전산시스템</p><h1 style="margin:0 0 24px;font-size:22px;font-weight:600">${title} 인증</h1><p style="margin:0 0 10px;font-size:14px">아래 인증번호를 화면에 입력해 주세요.</p><p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:6px">${code}</p><p style="margin:0;color:#7a8492;font-size:12px;line-height:1.6">인증번호는 5분 동안 유효합니다.<br>본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p></div></body></html>`,
      failureMessage: '이메일 인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.',
    });
  }

  async sendContactChangedNotice(input: {
    email: string;
    field: 'email' | 'phone';
  }): Promise<void> {
    if (!env.SES_FROM_EMAIL) {
      throw new ServiceUnavailableException({
        code: 'EMAIL_DELIVERY_NOT_CONFIGURED',
        message: '이메일 변경 알림 발송 설정을 확인해 주세요.',
      });
    }

    const fieldLabel = input.field === 'email' ? '이메일' : '전화번호';
    await this.sendEmail({
      to: input.email,
      subject: '[전남과학고 전산시스템] 연락처 변경 안내',
      text: `회원님의 ${fieldLabel}가 변경되었습니다. 본인이 변경하지 않았다면 즉시 학교 담당자에게 문의해 주세요.`,
      html: `<!doctype html><html lang="ko"><body style="margin:0;background:#f4f7f8;font-family:Arial,'Noto Sans KR',sans-serif;color:#172033"><div style="max-width:520px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dce4e7"><p style="margin:0 0 20px;color:#667085;font-size:14px">전남과학고등학교 전산시스템</p><h1 style="margin:0 0 24px;font-size:22px;font-weight:600">연락처 변경 안내</h1><p style="margin:0;font-size:15px;line-height:1.7">회원님의 ${fieldLabel}가 변경되었습니다.<br>본인이 변경하지 않았다면 즉시 학교 담당자에게 문의해 주세요.</p></div></body></html>`,
      failureMessage: '연락처 변경 안내를 보내지 못했습니다.',
    });
  }

  private async sendEmail(input: {
    to: string;
    subject: string;
    text: string;
    html: string;
    failureMessage: string;
  }): Promise<void> {
    const source = env.SES_FROM_NAME
      ? `${env.SES_FROM_NAME.replace(/[<>\r\n]/g, '').trim()} <${env.SES_FROM_EMAIL}>`
      : env.SES_FROM_EMAIL;

    try {
      await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: source,
          Destination: { ToAddresses: [input.to] },
          Content: {
            Simple: {
              Subject: { Charset: 'UTF-8', Data: input.subject },
              Body: {
                Text: { Charset: 'UTF-8', Data: input.text },
                Html: { Charset: 'UTF-8', Data: input.html },
              },
            },
          },
        }),
      );
    } catch (error) {
      this.logger.error(`SES email failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException({
        code: 'EMAIL_DELIVERY_FAILED',
        message: input.failureMessage,
      });
    }
  }
}
