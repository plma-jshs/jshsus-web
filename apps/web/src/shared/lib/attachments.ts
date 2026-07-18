export const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const ATTACHMENT_INPUT_ACCEPT = [...ALLOWED_ATTACHMENT_TYPES].join(',');

export const ATTACHMENT_FORMAT_DESCRIPTION = 'PDF, JPG, PNG, WebP';
