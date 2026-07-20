import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    TZ: z.string().default('Asia/Seoul'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    DATABASE_URL: z.string().default('mysql://jshsus:local_password@localhost:3306/jshsus'),
    DATABASE_SSL_MODE: z.enum(['disabled', 'required', 'verify_identity']).default('disabled'),
    DATABASE_SSL_CA_PATH: z.string().default(''),
    REDIS_URL: z.string().default('redis://localhost:6379/0'),
    SESSION_COOKIE_DOMAIN: z.string().default('localhost'),
    SESSION_COOKIE_HOST_ONLY: booleanFromString.default(false),
    SESSION_COOKIE_SECURE: booleanFromString.default(false),
    CSRF_SECRET: z.string().min(12).default('change-this-csrf-secret'),
    CSRF_COOKIE_NAME: z.string().default('jshsus.csrf'),
    AUTH_MODE: z
      .enum(['local', 'hybrid', 'cognito'])
      .default('cognito')
      .transform(() => 'cognito' as const),
    COGNITO_REGION: z.string().default('ap-northeast-2'),
    COGNITO_USER_POOL_ID: z.string().default(''),
    COGNITO_CLIENT_ID: z.string().default(''),
    COGNITO_CLIENT_SECRET: z.string().default(''),
    COGNITO_WEB_CLIENT_ID: z.string().default(''),
    COGNITO_WEB_CLIENT_SECRET: z.string().default(''),
    COGNITO_ADMIN_CLIENT_ID: z.string().default(''),
    COGNITO_ADMIN_CLIENT_SECRET: z.string().default(''),
    COGNITO_FLOW_TTL_SECONDS: z.coerce.number().int().min(120).max(900).default(300),
    COGNITO_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(15_000).default(5_000),
    PASSWORD_RESET_CODE_TTL_SECONDS: z.coerce.number().int().min(120).max(900).default(300),
    SENDON_API_BASE_URL: z.string().url().default('https://api.sendon.io'),
    SENDON_ACCOUNT_ID: z.string().trim().default(''),
    SENDON_API_KEY: z.string().trim().default(''),
    SENDON_KAKAO_SEND_PROFILE_ID: z.string().trim().default(''),
    SENDON_PASSWORD_RESET_TEMPLATE_ID: z.string().trim().default(''),
    SENDON_SMS_SENDER_NUMBER: z.string().trim().default(''),
    SENDON_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(15_000).default(5_000),
    LEGACY_SYSTEM_ADMIN_STUIDS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    LEGACY_STUDENT_AFFAIRS_HEAD_STUIDS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    IAM_COOKIE_NAME: z.string().default('iam_token'),
    IAM_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
    IAM_REMEMBER_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
    FILE_UPLOAD_MAX_MB: z.coerce.number().int().positive().default(10),
    FILE_CLEANUP_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
    FILE_CLEANUP_INTERVAL_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
    FILE_CLEANUP_LOCK_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(3_600_000)
      .default(300_000),
    FILE_CLEANUP_RETRY_BASE_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(30_000),
    FILE_CLEANUP_RETRY_MAX_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(86_400_000)
      .default(3_600_000),
    FILE_ALLOWED_MIME_TYPES: z
      .string()
      .default('image/jpeg,image/png,image/webp,application/pdf')
      .transform((value) =>
        value
          .split(',')
          .map((mime) => mime.trim())
          .filter(Boolean),
      ),
    FILE_LOCAL_DIR: z.string().default('/tmp/jshsus-uploads'),
    AWS_REGION: z.string().default('ap-northeast-2'),
    AWS_ACCESS_KEY_ID: z.string().default(''),
    AWS_SECRET_ACCESS_KEY: z.string().default(''),
    S3_BUCKET: z.string().default(''),
    S3_PUBLIC_BASE_URL: z.string().default(''),
    S3_ENDPOINT: z.string().default(''),
    S3_FORCE_PATH_STYLE: booleanFromString.default(false),
    NEIS_API_KEY: z.string().max(256).default(''),
    YOUTUBE_API_KEY: z.string().trim().max(256).default(''),
    NEIS_ATPT_OFCDC_SC_CODE: z
      .string()
      .regex(/^[A-Z][0-9]{2}$/)
      .default('Q10'),
    NEIS_SD_SCHUL_CODE: z
      .string()
      .regex(/^[0-9]{7}$/)
      .default('7140163'),
    NEIS_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(500).max(10_000).default(3_500),
    NEIS_CACHE_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3_600),
  })
  .transform((value) => {
    const cognitoClientId = value.COGNITO_CLIENT_ID.trim();
    const cognitoClientSecret = value.COGNITO_CLIENT_SECRET.trim();

    return {
      ...value,
      COGNITO_REGION: value.COGNITO_REGION.trim() || value.AWS_REGION,
      COGNITO_WEB_CLIENT_ID: value.COGNITO_WEB_CLIENT_ID.trim() || cognitoClientId,
      COGNITO_WEB_CLIENT_SECRET: value.COGNITO_WEB_CLIENT_SECRET.trim() || cognitoClientSecret,
      COGNITO_ADMIN_CLIENT_ID: value.COGNITO_ADMIN_CLIENT_ID.trim() || cognitoClientId,
      COGNITO_ADMIN_CLIENT_SECRET: value.COGNITO_ADMIN_CLIENT_SECRET.trim() || cognitoClientSecret,
    };
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production') {
      if (value.CSRF_SECRET === 'change-this-csrf-secret' || value.CSRF_SECRET.length < 32) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CSRF_SECRET'],
          message: 'Production CSRF_SECRET must be a non-default value of at least 32 characters.',
        });
      }

      if (!value.SESSION_COOKIE_SECURE) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SESSION_COOKIE_SECURE'],
          message: 'Production cookies must be secure.',
        });
      }

      if (value.SESSION_COOKIE_DOMAIN === 'localhost') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SESSION_COOKIE_DOMAIN'],
          message: 'Production cookie domain must not be localhost.',
        });
      }

      if (!value.YOUTUBE_API_KEY) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['YOUTUBE_API_KEY'],
          message: 'Production requires a YouTube Data API v3 key.',
        });
      }

      if (/local_(?:mysql_)?password|local_password/.test(value.DATABASE_URL)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'Production database credentials must not use local defaults.',
        });
      }

      const databaseHost = new URL(value.DATABASE_URL).hostname;
      if (
        !['localhost', '127.0.0.1', 'mysql'].includes(databaseHost) &&
        value.DATABASE_SSL_MODE === 'disabled'
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_SSL_MODE'],
          message: 'Production connections to remote MySQL must enable TLS.',
        });
      }

      if (value.REDIS_URL.includes('local_redis_password')) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_URL'],
          message: 'Production Redis credentials must not use local defaults.',
        });
      }

      if (!value.SESSION_COOKIE_HOST_ONLY) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SESSION_COOKIE_HOST_ONLY'],
          message: 'Cognito-backed production sessions must use host-only cookies.',
        });
      }

      if (!value.IAM_COOKIE_NAME.startsWith('__Host-')) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['IAM_COOKIE_NAME'],
          message: 'Cognito-backed production sessions require a dedicated __Host- cookie name.',
        });
      }

      if (!value.CSRF_COOKIE_NAME.startsWith('__Host-')) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CSRF_COOKIE_NAME'],
          message:
            'Cognito-backed production CSRF cookies require a dedicated __Host- cookie name.',
        });
      }

      const requiredCognitoValues: Array<
        [
          keyof Pick<
            typeof value,
            | 'COGNITO_USER_POOL_ID'
            | 'COGNITO_WEB_CLIENT_ID'
            | 'COGNITO_WEB_CLIENT_SECRET'
            | 'COGNITO_ADMIN_CLIENT_ID'
            | 'COGNITO_ADMIN_CLIENT_SECRET'
          >,
          string,
        ]
      > = [
        ['COGNITO_USER_POOL_ID', value.COGNITO_USER_POOL_ID],
        ['COGNITO_WEB_CLIENT_ID', value.COGNITO_WEB_CLIENT_ID],
        ['COGNITO_WEB_CLIENT_SECRET', value.COGNITO_WEB_CLIENT_SECRET],
        ['COGNITO_ADMIN_CLIENT_ID', value.COGNITO_ADMIN_CLIENT_ID],
        ['COGNITO_ADMIN_CLIENT_SECRET', value.COGNITO_ADMIN_CLIENT_SECRET],
      ];

      for (const [key, configuredValue] of requiredCognitoValues) {
        if (!configuredValue.trim()) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required for Cognito-backed production authentication.`,
          });
        }
      }
    }

    if (value.DATABASE_SSL_MODE === 'verify_identity' && !value.DATABASE_SSL_CA_PATH) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_SSL_CA_PATH'],
        message: 'verify_identity requires a CA certificate path.',
      });
    }

    if (value.FILE_CLEANUP_RETRY_MAX_MS < value.FILE_CLEANUP_RETRY_BASE_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FILE_CLEANUP_RETRY_MAX_MS'],
        message: 'FILE_CLEANUP_RETRY_MAX_MS must be at least FILE_CLEANUP_RETRY_BASE_MS.',
      });
    }

    if (value.S3_BUCKET && (!value.AWS_ACCESS_KEY_ID || !value.AWS_SECRET_ACCESS_KEY)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['S3_BUCKET'],
        message:
          'S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY must be configured together.',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
