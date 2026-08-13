import { env } from '../config/env';

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

export function getS3PublicBaseUrl(): string {
  const configured = env.S3_PUBLIC_BASE_URL.trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (!env.S3_BUCKET || env.S3_ENDPOINT) return '';

  return `https://s3.${env.AWS_REGION}.amazonaws.com/${env.S3_BUCKET}`;
}

export function getS3PublicObjectUrl(objectKey: string): string | null {
  const baseUrl = getS3PublicBaseUrl();
  if (!baseUrl || !objectKey) return null;

  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl}/${trimSlashes(encodedKey)}`;
}
