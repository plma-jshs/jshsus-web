import type { BoardCommentSummary, ContentLikeState } from '@jshsus/types';
import { request } from '../../shared/api/http';

export type JbsPost = {
  id: number;
  title: string;
  description: string;
  youtubeVideoId: string;
  canonicalUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
  authorName?: string;
  viewCount: number;
  commentCount: number;
  likeCount: number;
  likedByMe: boolean;
  canEdit?: boolean;
  createdAt: string;
};

export type JbsPostPage = {
  items: JbsPost[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type JbsVideoPreview = {
  videoId: string;
  canonicalUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
  title: string;
  channelTitle?: string;
  durationSeconds: number;
};

export type JbsPostListQuery = {
  page: number;
  pageSize: 20 | 50 | 100;
  field: 'title_content' | 'title' | 'author';
  q: string;
};

export function getJbsPosts(query: JbsPostListQuery) {
  const search = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    field: query.field,
    q: query.q,
  });
  return request<JbsPostPage>(`/api/jbs/posts?${search.toString()}`);
}

export function getJbsPost(postId: number) {
  return request<JbsPost>(`/api/jbs/posts/${postId}`);
}

export function previewJbsVideo(url: string) {
  const search = new URLSearchParams({ url });
  return request<JbsVideoPreview>(`/api/jbs/youtube/preview?${search.toString()}`);
}

export function createJbsPost(input: { title: string; description: string; youtubeUrl: string }) {
  return request<{
    ok: true;
    post: Pick<
      JbsPost,
      | 'id'
      | 'title'
      | 'description'
      | 'youtubeVideoId'
      | 'canonicalUrl'
      | 'embedUrl'
      | 'thumbnailUrl'
    >;
  }>('/api/jbs/posts', {
    method: 'POST',
    body: input,
  });
}

export function updateJbsPost(
  postId: number,
  input: { title?: string; description?: string; youtubeUrl?: string },
) {
  return request<{ ok: true; id: number }>(`/api/jbs/posts/${postId}`, {
    method: 'PUT',
    body: input,
  });
}

export function deleteJbsPost(postId: number) {
  return request<{ ok: true; id: number }>(`/api/jbs/posts/${postId}`, {
    method: 'DELETE',
  });
}

export function getJbsComments(postId: number) {
  return request<BoardCommentSummary[]>(`/api/jbs/posts/${postId}/comments`);
}

export function createJbsComment(postId: number, content: string) {
  return request<{ ok: true; comment: { id: number; postId: number } }>(
    `/api/jbs/posts/${postId}/comments`,
    { method: 'POST', body: { content } },
  );
}

export function toggleJbsPostLike(postId: number) {
  return request<ContentLikeState>(`/api/jbs/posts/${postId}/like`, { method: 'POST' });
}

export function toggleJbsCommentLike(postId: number, commentId: number) {
  return request<ContentLikeState>(`/api/jbs/posts/${postId}/comments/${commentId}/like`, {
    method: 'POST',
  });
}
