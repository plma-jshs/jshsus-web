export const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.hancom.hwp',
  'application/vnd.hancom.hwpx',
  'application/x-hwp',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
]);

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  '.pdf',
  '.hwp',
  '.hwpx',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.csv',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
] as const;

export const ATTACHMENT_INPUT_ACCEPT = [
  ...ALLOWED_ATTACHMENT_TYPES,
  ...ALLOWED_ATTACHMENT_EXTENSIONS,
].join(',');

export const ATTACHMENT_FORMAT_DESCRIPTION =
  'PDF, JPG, PNG, WebP, HWP, HWPX, DOC, DOCX, PPT, PPTX, XLS, XLSX, CSV';

export function isAllowedAttachmentFile(file: Pick<File, 'name' | 'type'>) {
  if (ALLOWED_ATTACHMENT_TYPES.has(file.type)) return true;
  const lowerName = file.name.toLowerCase();
  return ALLOWED_ATTACHMENT_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}
