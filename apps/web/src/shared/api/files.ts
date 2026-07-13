import type { UploadedFileSummary } from '@jshsus/types';
import { uploadRequest } from './http';

export async function uploadFile(input: {
  file: File;
  targetType: string;
  targetId: number;
  visibility?: UploadedFileSummary['visibility'];
}) {
  const formData = new FormData();
  formData.set('file', input.file);
  formData.set('targetType', input.targetType);
  formData.set('targetId', String(input.targetId));
  formData.set('visibility', input.visibility ?? 'private');
  return uploadRequest<{ ok: true; file: UploadedFileSummary }>('/api/files', formData);
}
