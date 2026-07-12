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
    SESSION_COOKIE_SECURE: booleanFromString.default(false),
    CSRF_SECRET: z.string().min(12).default('change-this-csrf-secret'),
    CSRF_COOKIE_NAME: z.string().default('jshsus.csrf'),
    ALLOW_DEV_AUTH: booleanFromString.default(false),
    DEV_AUTH_PASSWORD: z.string().default('local-dev-only'),
    PASSWORD_REHASH_ON_LOGIN: booleanFromString.default(true),
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
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
    FILE_UPLOAD_MAX_MB: z.coerce.number().int().positive().default(10),
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

      if (value.ALLOW_DEV_AUTH) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ALLOW_DEV_AUTH'],
          message: 'Development authentication must be disabled in production.',
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
    }

    if (value.DATABASE_SSL_MODE === 'verify_identity' && !value.DATABASE_SSL_CA_PATH) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_SSL_CA_PATH'],
        message: 'verify_identity requires a CA certificate path.',
      });
    }

    const s3Values = [value.S3_BUCKET, value.AWS_ACCESS_KEY_ID, value.AWS_SECRET_ACCESS_KEY];
    if (s3Values.some(Boolean) && !s3Values.every(Boolean)) {
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
