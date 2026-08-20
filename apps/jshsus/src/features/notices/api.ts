import type { NoticeDetail, NoticeListItem, PaginatedResponse } from '@jshsus/types';
import { request } from '../../shared/api/http';

export type NoticeListQuery = {
  page: number;
  pageSize: 20 | 50 | 100;
  field: 'title_content' | 'title' | 'author';
  q: string;
};

export type NoticeListResult = PaginatedResponse<NoticeListItem>;

export function getNotices(query: NoticeListQuery) {
  const search = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    field: query.field,
    q: query.q,
  });

  return request<NoticeListResult>(`/api/notices?${search.toString()}`);
}

export function getNotice(noticeId: number) {
  return request<NoticeDetail>(`/api/notices/${noticeId}`);
}

export function createNotice(input: {
  title: string;
  department: string;
  content: string;
  pinned: boolean;
}) {
  return request<{ ok: true; notice: { id: number } }>('/api/admin/notices', {
    method: 'POST',
    body: { ...input, visibility: 'public' },
  });
}

export function deleteNotice(noticeId: number) {
  return request<{ ok: true; id: number }>(`/api/admin/notices/${noticeId}`, {
    method: 'DELETE',
  });
}

export function updateNotice(
  noticeId: number,
  input: { title?: string; department?: string; content?: string; pinned?: boolean },
) {
  return request<{ ok: true; id: number }>(`/api/admin/notices/${noticeId}`, {
    method: 'PUT',
    body: input,
  });
}
