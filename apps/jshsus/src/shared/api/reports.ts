import type { ContentReportSummary } from '@jshsus/types';
import { request } from './http';

export function createContentReport(input: {
  targetType: ContentReportSummary['targetType'];
  targetId: number;
  reason: string;
  detail?: string;
}) {
  return request<{ ok: true; report: { id: number } }>('/api/reports', {
    method: 'POST',
    body: input,
  });
}
