import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { env } from '../../shared/config/env';

export type VerificationPurpose = 'account-activation' | 'contact-change' | 'password-reset';

const SCHOOL_LOGO_URL = 'https://auth.jshsus.kr/assets/school-emblem.svg';
const EMAIL_FONT_STACK = "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', Arial, sans-serif";

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

function renderVerificationEmail(input: { title: string; code: string }): string {
  const codeCells = [...input.code]
    .map(
      (digit) =>
        `<td style="padding:0 4px"><div style="width:48px;height:58px;border-radius:10px;background:#eaf5ff;color:#145b96;font-size:30px;font-weight:700;line-height:58px;text-align:center">${digit}</div></td>`,
    )
    .join('');

  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)} 인증</title></head><body style="margin:0;background:#f7f8fa;color:#172033;font-family:${EMAIL_FONT_STACK};-webkit-font-smoothing:antialiased"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:#f7f8fa"><tr><td align="center" style="padding:40px 16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;border:1px solid #e7eaed;border-radius:20px;background:#fff"><tr><td align="center" style="padding:40px 24px 34px;text-align:center"><img src="${SCHOOL_LOGO_URL}" width="72" height="72" alt="전남과학고등학교 로고" style="display:block;width:72px;height:72px;margin:0 auto 22px;object-fit:contain"><h1 style="padding:0;margin:0 0 12px;color:#111827;font-size:28px;font-weight:700;letter-spacing:-.04em;line-height:1.35">${escapeHtml(input.title)} 인증</h1><p style="padding:0;margin:0;color:#667085;font-size:16px;line-height:1.7">아래 인증번호를 화면에 입력해 주세요.</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 24px"><tr>${codeCells}</tr></table><p style="padding:0;margin:0;color:#667085;font-size:14px;line-height:1.8">인증번호는 5분 동안 유효합니다.<br>본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p><div style="height:1px;margin:30px 0 18px;background:#edf1f2"></div><p style="padding:0;margin:0;color:#98a2b3;font-size:12px;line-height:1.8">본 메일은 발신 전용 메일입니다.<br>Copyright © 전남과학고등학교 IT부. All Rights Reserved.</p></td></tr></table></td></tr></table></body></html>`;
}

function renderContactChangedEmail(fieldLabel: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>연락처 변경 안내</title></head><body style="margin:0;background:#f7f8fa;color:#172033;font-family:${EMAIL_FONT_STACK};-webkit-font-smoothing:antialiased"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:#f7f8fa"><tr><td align="center" style="padding:40px 16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;border:1px solid #e7eaed;border-radius:20px;background:#fff"><tr><td align="center" style="padding:40px 24px 34px;text-align:center"><img src="${SCHOOL_LOGO_URL}" width="72" height="72" alt="전남과학고등학교 로고" style="display:block;width:72px;height:72px;margin:0 auto 22px;object-fit:contain"><h1 style="padding:0;margin:0 0 16px;color:#111827;font-size:28px;font-weight:700;letter-spacing:-.04em;line-height:1.35">연락처 변경 안내</h1><p style="padding:0;margin:0;color:#667085;font-size:16px;line-height:1.8">회원님의 ${escapeHtml(fieldLabel)}가 변경되었습니다.<br>본인이 변경하지 않았다면 즉시 학교 담당자에게 문의해 주세요.</p><div style="height:1px;margin:30px 0 18px;background:#edf1f2"></div><p style="padding:0;margin:0;color:#98a2b3;font-size:12px;line-height:1.8">본 메일은 발신 전용 메일입니다.<br>Copyright © 전남과학고등학교 IT부. All Rights Reserved.</p></td></tr></table></td></tr></table></body></html>`;
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly client = new SESv2Client({
    region: env.SES_REGION,
    credentials: env.SES_AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: env.SES_AWS_ACCESS_KEY_ID,
          secretAccessKey: env.SES_AWS_SECRET_ACCESS_KEY,
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

    const title =
      input.purpose === 'account-activation'
        ? '계정 생성'
        : input.purpose === 'password-reset'
          ? '비밀번호 재설정'
          : '이메일 변경';
    const code = escapeHtml(input.code);
    await this.sendEmail({
      to: input.email,
      subject: `[전남과학고등학교] ${title} 인증번호`,
      text: `${title} 인증번호는 ${input.code}입니다. 인증번호는 5분 동안 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.\n\n본 메일은 발신 전용 메일입니다.\nCopyright © 전남과학고등학교 IT부. All Rights Reserved.`,
      html: renderVerificationEmail({ title, code }),
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
      subject: '[전남과학고등학교] 연락처 변경 안내',
      text: `회원님의 ${fieldLabel}가 변경되었습니다. 본인이 변경하지 않았다면 즉시 학교 담당자에게 문의해 주세요.`,
      html: renderContactChangedEmail(fieldLabel),
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
