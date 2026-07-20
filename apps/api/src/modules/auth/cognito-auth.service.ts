import { Injectable } from '@nestjs/common';
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHmac } from 'node:crypto';
import { env } from '../../shared/config/env';

export type CognitoSurface = 'web' | 'admin';

export type CognitoAuthenticationResult =
  | {
      kind: 'authenticated';
      subject: string;
      username: string;
    }
  | {
      kind: 'new-password-required';
      requiredAttributes: string[];
      session: string;
      username: string;
    };

type CognitoClientConfig = {
  clientId: string;
  clientSecret: string;
};

type CognitoAuthenticationResponse = {
  ChallengeName?: string;
  Session?: string;
  ChallengeParameters?: Record<string, string>;
  AuthenticationResult?: {
    AccessToken?: string;
  };
};

type CognitoUserResponse = {
  Username?: string;
  UserAttributes?: Array<{ Name?: string; Value?: string }>;
};

export type CognitoAuthErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_PASSWORD_RESET_REQUIRED'
  | 'AUTH_USER_NOT_CONFIRMED'
  | 'AUTH_CODE_MISMATCH'
  | 'AUTH_CODE_EXPIRED'
  | 'AUTH_INVALID_PASSWORD'
  | 'AUTH_RATE_LIMITED'
  | 'AUTH_UNSUPPORTED_CHALLENGE'
  | 'AUTH_ACCOUNT_ATTRIBUTES_REQUIRED'
  | 'AUTH_RECOVERY_UNAVAILABLE'
  | 'AUTH_PASSWORD_CHANGED_RELOGIN_REQUIRED'
  | 'AUTH_PROVIDER_UNAVAILABLE';

export class CognitoAuthError extends Error {
  constructor(
    readonly code: CognitoAuthErrorCode,
    message: string,
    readonly causeName?: string,
  ) {
    super(message);
    this.name = 'CognitoAuthError';
  }
}

export function createCognitoSecretHash(
  username: string,
  clientId: string,
  clientSecret: string,
): string {
  return createHmac('sha256', clientSecret).update(`${username}${clientId}`).digest('base64');
}

function getRequiredAttributes(parameters?: Record<string, string>): string[] {
  const raw = parameters?.requiredAttributes;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string');
    }
  } catch {
    // Fail closed: a malformed required-attributes response is not safe to
    // continue without collecting the attributes Cognito expects.
  }

  return [raw];
}

function isSupportedRequiredAttribute(attribute: string): boolean {
  return attribute === 'userAttributes.email' || attribute === 'email';
}

function challengeResponseAttributeName(attribute: string): string {
  return attribute.startsWith('userAttributes.') ? attribute : `userAttributes.${attribute}`;
}

@Injectable()
export class CognitoAuthService {
  private readonly endpoint = `https://cognito-idp.${env.COGNITO_REGION}.amazonaws.com/`;
  private adminClient?: CognitoIdentityProviderClient;

  async authenticate(
    username: string,
    password: string,
    surface: CognitoSurface,
  ): Promise<CognitoAuthenticationResult> {
    const client = this.getClient(surface);
    const response = await this.call<CognitoAuthenticationResponse>('InitiateAuth', {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: client.clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        SECRET_HASH: createCognitoSecretHash(username, client.clientId, client.clientSecret),
      },
    });

    if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      if (!response.Session) {
        throw new CognitoAuthError('AUTH_PROVIDER_UNAVAILABLE', '인증 절차를 시작하지 못했습니다.');
      }

      const requiredAttributes = getRequiredAttributes(response.ChallengeParameters);
      if (requiredAttributes.some((attribute) => !isSupportedRequiredAttribute(attribute))) {
        throw new CognitoAuthError(
          'AUTH_ACCOUNT_ATTRIBUTES_REQUIRED',
          '계정에 필요한 정보를 학교 담당자가 먼저 확인해야 합니다.',
        );
      }

      return {
        kind: 'new-password-required',
        requiredAttributes,
        session: response.Session,
        username:
          response.ChallengeParameters?.USER_ID_FOR_SRP ??
          response.ChallengeParameters?.USERNAME ??
          username,
      };
    }

    if (response.ChallengeName) {
      throw new CognitoAuthError(
        'AUTH_UNSUPPORTED_CHALLENGE',
        '현재 로그인 절차에서 지원하지 않는 추가 인증이 필요합니다.',
        response.ChallengeName,
      );
    }

    return this.resolveAuthenticatedUser(response, username);
  }

  async completeNewPassword(input: {
    username: string;
    newPassword: string;
    requiredAttributeValues?: Record<string, string>;
    session: string;
    surface: CognitoSurface;
  }): Promise<Extract<CognitoAuthenticationResult, { kind: 'authenticated' }>> {
    const client = this.getClient(input.surface);
    const requiredAttributeResponses = Object.fromEntries(
      Object.entries(input.requiredAttributeValues ?? {}).map(([attribute, value]) => [
        challengeResponseAttributeName(attribute),
        value,
      ]),
    );
    const response = await this.call<CognitoAuthenticationResponse>('RespondToAuthChallenge', {
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ClientId: client.clientId,
      Session: input.session,
      ChallengeResponses: {
        USERNAME: input.username,
        NEW_PASSWORD: input.newPassword,
        ...requiredAttributeResponses,
        SECRET_HASH: createCognitoSecretHash(input.username, client.clientId, client.clientSecret),
      },
    });

    if (response.ChallengeName) {
      throw new CognitoAuthError(
        'AUTH_UNSUPPORTED_CHALLENGE',
        '현재 로그인 절차에서 지원하지 않는 추가 인증이 필요합니다.',
        response.ChallengeName,
      );
    }

    try {
      return await this.resolveAuthenticatedUser(response, input.username);
    } catch (error) {
      // RespondToAuthChallenge already succeeded, so Cognito may have changed
      // the password even when the follow-up GetUser lookup is throttled or
      // otherwise fails. Never invite the user to submit the consumed flow
      // again; ask them to authenticate with the new password instead.
      throw new CognitoAuthError(
        'AUTH_PASSWORD_CHANGED_RELOGIN_REQUIRED',
        '비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.',
        error instanceof CognitoAuthError
          ? (error.causeName ?? error.code)
          : error instanceof Error
            ? error.name
            : undefined,
      );
    }
  }

  async forgotPassword(username: string, surface: CognitoSurface): Promise<void> {
    const client = this.getClient(surface);
    await this.call('ForgotPassword', {
      ClientId: client.clientId,
      Username: username,
      SecretHash: createCognitoSecretHash(username, client.clientId, client.clientSecret),
    });
  }

  async confirmForgotPassword(input: {
    username: string;
    code: string;
    newPassword: string;
    surface: CognitoSurface;
  }): Promise<void> {
    const client = this.getClient(input.surface);
    await this.call('ConfirmForgotPassword', {
      ClientId: client.clientId,
      Username: input.username,
      ConfirmationCode: input.code,
      Password: input.newPassword,
      SecretHash: createCognitoSecretHash(input.username, client.clientId, client.clientSecret),
    });
  }

  async setPermanentPassword(username: string, password: string): Promise<void> {
    await this.getAdminClient()
      .send(
        new AdminSetUserPasswordCommand({
          Password: password,
          Permanent: true,
          Username: username.trim(),
          UserPoolId: env.COGNITO_USER_POOL_ID,
        }),
      )
      .catch((error) => {
        throw this.mapAdminProviderError(error, 'AdminSetUserPassword');
      });
  }

  async findUserSubject(username: string): Promise<string | null> {
    const user = await this.getAdminUser(username.trim());
    if (!user) return null;
    return this.subjectFromUser(user, username);
  }

  async createOrUpdatePermanentPasswordUser(input: {
    username: string;
    password: string;
    email: string;
    name: string;
  }): Promise<{ subject: string; username: string; created: boolean }> {
    const username = input.username.trim();
    const client = this.getAdminClient();
    const attributes = [
      { Name: 'preferred_username', Value: username },
      { Name: 'name', Value: input.name },
      { Name: 'email', Value: input.email },
      { Name: 'email_verified', Value: 'true' },
    ];
    let user = await this.getAdminUser(username);
    let created = false;

    if (!user) {
      try {
        await client.send(
          new AdminCreateUserCommand({
            MessageAction: 'SUPPRESS',
            TemporaryPassword: input.password,
            UserAttributes: attributes,
            Username: username,
            UserPoolId: env.COGNITO_USER_POOL_ID,
          }),
        );
        created = true;
      } catch (error) {
        if (this.safeProviderErrorName(error) !== 'UsernameExistsException') {
          throw this.mapAdminProviderError(error, 'AdminCreateUser');
        }
      }

      user = await this.getAdminUser(username);
      if (!user) {
        throw new CognitoAuthError(
          'AUTH_PROVIDER_UNAVAILABLE',
          '통합로그인 계정 생성을 확인하지 못했습니다.',
        );
      }
    } else {
      await client
        .send(
          new AdminUpdateUserAttributesCommand({
            UserAttributes: attributes,
            Username: username,
            UserPoolId: env.COGNITO_USER_POOL_ID,
          }),
        )
        .catch((error) => {
          throw this.mapAdminProviderError(error, 'AdminUpdateUserAttributes');
        });
    }

    await client
      .send(
        new AdminSetUserPasswordCommand({
          Password: input.password,
          Permanent: true,
          Username: username,
          UserPoolId: env.COGNITO_USER_POOL_ID,
        }),
      )
      .catch((error) => {
        throw this.mapAdminProviderError(error, 'AdminSetUserPassword');
      });

    return {
      subject: this.subjectFromUser(user, username),
      username: user.Username ?? username,
      created,
    };
  }

  private async resolveAuthenticatedUser(
    response: CognitoAuthenticationResponse,
    fallbackUsername: string,
  ): Promise<Extract<CognitoAuthenticationResult, { kind: 'authenticated' }>> {
    const accessToken = response.AuthenticationResult?.AccessToken;
    if (!accessToken) {
      throw new CognitoAuthError('AUTH_PROVIDER_UNAVAILABLE', '인증 결과를 확인하지 못했습니다.');
    }

    // GetUser validates the access token at Cognito. Tokens are deliberately
    // discarded after the immutable subject has been resolved; the browser
    // only receives our opaque Redis session cookie.
    const user = await this.call<CognitoUserResponse>('GetUser', { AccessToken: accessToken });
    const subject = user.UserAttributes?.find((attribute) => attribute.Name === 'sub')?.Value;

    if (!subject) {
      throw new CognitoAuthError(
        'AUTH_PROVIDER_UNAVAILABLE',
        '인증 계정의 식별자를 확인하지 못했습니다.',
      );
    }

    return {
      kind: 'authenticated',
      subject,
      username: user.Username ?? fallbackUsername,
    };
  }

  private getClient(surface: CognitoSurface): CognitoClientConfig {
    if (surface === 'admin') {
      return {
        clientId: env.COGNITO_ADMIN_CLIENT_ID,
        clientSecret: env.COGNITO_ADMIN_CLIENT_SECRET,
      };
    }

    return {
      clientId: env.COGNITO_WEB_CLIENT_ID,
      clientSecret: env.COGNITO_WEB_CLIENT_SECRET,
    };
  }

  private async call<T = Record<string, never>>(operation: string, body: unknown): Promise<T> {
    let response: Response;

    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-amz-json-1.1',
          'x-amz-target': `AWSCognitoIdentityProviderService.${operation}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(env.COGNITO_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new CognitoAuthError(
        'AUTH_PROVIDER_UNAVAILABLE',
        '인증 서버에 연결하지 못했습니다.',
        error instanceof Error ? error.name : undefined,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const rawType = String(payload.__type ?? payload.code ?? '');
      const causeName = rawType.split('#').at(-1) ?? rawType;
      throw this.mapProviderError(causeName, operation);
    }

    return payload as T;
  }

  private getAdminClient(): CognitoIdentityProviderClient {
    if (!env.COGNITO_USER_POOL_ID) {
      throw new CognitoAuthError(
        'AUTH_PROVIDER_UNAVAILABLE',
        '통합로그인 사용자 풀이 설정되어 있지 않습니다.',
      );
    }

    this.adminClient ??= new CognitoIdentityProviderClient({ region: env.COGNITO_REGION });
    return this.adminClient;
  }

  private async getAdminUser(username: string): Promise<CognitoUserResponse | null> {
    const client = this.getAdminClient();

    try {
      return await client.send(
        new AdminGetUserCommand({
          Username: username,
          UserPoolId: env.COGNITO_USER_POOL_ID,
        }),
      );
    } catch (error) {
      if (this.safeProviderErrorName(error) === 'UserNotFoundException') return null;
      throw this.mapAdminProviderError(error, 'AdminGetUser');
    }
  }

  private subjectFromUser(user: CognitoUserResponse, fallbackUsername: string): string {
    const subject = user.UserAttributes?.find((attribute) => attribute.Name === 'sub')?.Value;
    if (!subject) {
      throw new CognitoAuthError(
        'AUTH_PROVIDER_UNAVAILABLE',
        `${user.Username ?? fallbackUsername} 통합로그인 식별자를 확인하지 못했습니다.`,
      );
    }
    return subject;
  }

  private safeProviderErrorName(error: unknown): string {
    if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
      return error.name;
    }
    return 'UnknownError';
  }

  private mapAdminProviderError(error: unknown, operation: string): CognitoAuthError {
    const causeName = this.safeProviderErrorName(error);
    return this.mapProviderError(causeName, operation);
  }

  private mapProviderError(causeName: string, operation: string): CognitoAuthError {
    switch (causeName) {
      case 'NotAuthorizedException':
      case 'UserNotFoundException':
        return new CognitoAuthError(
          'AUTH_INVALID_CREDENTIALS',
          '계정 또는 비밀번호를 확인해 주세요.',
          causeName,
        );
      case 'PasswordResetRequiredException':
        return new CognitoAuthError(
          'AUTH_PASSWORD_RESET_REQUIRED',
          '비밀번호 재설정이 필요합니다.',
          causeName,
        );
      case 'UserNotConfirmedException':
        return new CognitoAuthError(
          'AUTH_USER_NOT_CONFIRMED',
          '이메일 인증이 필요합니다.',
          causeName,
        );
      case 'CodeMismatchException':
        return new CognitoAuthError('AUTH_CODE_MISMATCH', '인증 코드를 확인해 주세요.', causeName);
      case 'ExpiredCodeException':
        return new CognitoAuthError('AUTH_CODE_EXPIRED', '인증 코드가 만료되었습니다.', causeName);
      case 'InvalidPasswordException':
        return new CognitoAuthError(
          'AUTH_INVALID_PASSWORD',
          '비밀번호가 보안 조건을 충족하지 않습니다.',
          causeName,
        );
      case 'InvalidParameterException':
        if (operation === 'ForgotPassword') {
          return new CognitoAuthError(
            'AUTH_RECOVERY_UNAVAILABLE',
            '이 계정에서는 이메일 비밀번호 재설정을 사용할 수 없습니다.',
            causeName,
          );
        }

        if (['RespondToAuthChallenge', 'ConfirmForgotPassword'].includes(operation)) {
          return new CognitoAuthError(
            'AUTH_INVALID_PASSWORD',
            '입력한 새 비밀번호 또는 인증 코드를 확인해 주세요.',
            causeName,
          );
        }

        return new CognitoAuthError(
          'AUTH_PROVIDER_UNAVAILABLE',
          '인증 서버에서 요청을 처리하지 못했습니다.',
          causeName,
        );
      case 'LimitExceededException':
      case 'TooManyRequestsException':
      case 'TooManyFailedAttemptsException':
        return new CognitoAuthError(
          'AUTH_RATE_LIMITED',
          '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
          causeName,
        );
      default:
        return new CognitoAuthError(
          'AUTH_PROVIDER_UNAVAILABLE',
          '인증 서버에서 요청을 처리하지 못했습니다.',
          causeName,
        );
    }
  }
}
