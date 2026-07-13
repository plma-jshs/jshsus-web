import type { NoticeDetail, NoticeListItem, PaginatedResponse } from '@jshsus/types';
import { request } from '../../shared/api/http';

export type NoticeListQuery = {
  page: number;
  pageSize: 10 | 20 | 30 | 50;
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
