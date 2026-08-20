import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../shared/config/env';
import { SendonPasswordResetService } from './sendon-password-reset.service';

const originalSendonEnv = {
  accountId: env.SENDON_ACCOUNT_ID,
  apiKey: env.SENDON_API_KEY,
  profileId: env.SENDON_KAKAO_SEND_PROFILE_ID,
  templateId: env.SENDON_PASSWORD_RESET_TEMPLATE_ID,
  senderNumber: env.SENDON_SMS_SENDER_NUMBER,
};

function configureSendon() {
  Object.assign(env, {
    SENDON_ACCOUNT_ID: 'test-account',
    SENDON_API_KEY: 'test-api-key',
    SENDON_KAKAO_SEND_PROFILE_ID: '@test-channel',
    SENDON_PASSWORD_RESET_TEMPLATE_ID: 'test-template-code',
    SENDON_SMS_SENDER_NUMBER: '',
  });
}

describe('SendonPasswordResetService', () => {
  afterEach(() => {
    Object.assign(env, {
      SENDON_ACCOUNT_ID: originalSendonEnv.accountId,
      SENDON_API_KEY: originalSendonEnv.apiKey,
      SENDON_KAKAO_SEND_PROFILE_ID: originalSendonEnv.profileId,
      SENDON_PASSWORD_RESET_TEMPLATE_ID: originalSendonEnv.templateId,
      SENDON_SMS_SENDER_NUMBER: originalSendonEnv.senderNumber,
    });
    vi.unstubAllGlobals();
  });

  it('sends the approved AlimTalk template with account-id authentication', async () => {
    configureSendon();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 200, data: { groupId: 'group-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new SendonPasswordResetService().sendPasswordResetCode({
      phone: '+82 10-1234-5678',
      code: '123456',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.sendon.io/v2/messages/kakao/alim-talk');
    expect(request.headers).toMatchObject({
      authorization: `Basic ${Buffer.from('test-account:test-api-key').toString('base64')}`,
      'content-type': 'application/json',
    });
    expect(JSON.parse(String(request.body))).toEqual({
      sendProfileId: '@test-channel',
      templateId: 'test-template-code',
      to: [
        {
          phone: '01012345678',
          variables: {
            '#{인증번호}': '123456',
          },
        },
      ],
      fallback: { fallbackType: 'NONE' },
      useCredit: true,
    });
  });

  it('refuses delivery when the Sendon account id is absent', async () => {
    configureSendon();
    Object.assign(env, { SENDON_ACCOUNT_ID: '' });

    await expect(
      new SendonPasswordResetService().sendPasswordResetCode({
        phone: '01012345678',
        code: '123456',
      }),
    ).rejects.toMatchObject({
      response: { code: 'AUTH_RECOVERY_UNAVAILABLE' },
    });
  });
});
