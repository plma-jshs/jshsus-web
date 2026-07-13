import type {
  BoardCommentSummary,
  BoardPostDetail,
  BoardPostListItem,
  PaginatedResponse,
  PostStatus,
  RichTextDocument,
} from '@jshsus/types';
import { request } from '../../shared/api/http';

export type BoardPostListQuery = {
  page: number;
  pageSize: 10 | 20 | 30 | 50;
  field: 'title_content' | 'title' | 'author';
  q: string;
};

export type BoardPostListResult = PaginatedResponse<BoardPostListItem>;

export type BoardPostInput = {
  slug?: string;
  title: string;
  content: string;
  contentDoc: RichTextDocument;
  isAnonymous: boolean;
};

type BoardPostMutationResult = {
  ok: true;
  post: {
    id: number;
    boardSlug: string;
    title?: string;
    content?: string;
    contentDoc?: RichTextDocument;
    isAnonymous?: boolean;
    status: PostStatus;
  };
};

export function getBoardPosts(slug = 'free', query: BoardPostListQuery) {
  const search = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    field: query.field,
    q: query.q,
  });
  return request<BoardPostListResult>(`/api/boards/${slug}/posts?${search.toString()}`);
}

export function getBoardPost(slug: string, postId: number) {
  return request<BoardPostDetail>(`/api/boards/${slug}/posts/${postId}`);
}

export function getBoardComments(slug: string, postId: number) {
  return request<BoardCommentSummary[]>(`/api/boards/${slug}/posts/${postId}/comments`);
}

export function createBoardPost(input: BoardPostInput) {
  const { slug = 'free', ...body } = input;
  return request<BoardPostMutationResult>(`/api/boards/${slug}/posts`, {
    method: 'POST',
    body,
  });
}

export function createBoardPostDraft(input: BoardPostInput) {
  const { slug = 'free', ...body } = input;
  return request<BoardPostMutationResult>(`/api/boards/${slug}/posts/drafts`, {
    method: 'POST',
    body,
  });
}

export function updateBoardPost(input: BoardPostInput & { postId: number }) {
  const { slug = 'free', postId, ...body } = input;
  return request<BoardPostMutationResult>(`/api/boards/${slug}/posts/${postId}`, {
    method: 'PATCH',
    body,
  });
}

export function publishBoardPost(slug: string, postId: number) {
  return request<BoardPostMutationResult>(`/api/boards/${slug}/posts/${postId}/publish`, {
    method: 'POST',
  });
}

export function deleteBoardPostDraft(slug: string, postId: number) {
  return request<{ ok: true; id: number }>(`/api/boards/${slug}/posts/${postId}`, {
    method: 'DELETE',
  });
}

export function createBoardComment(input: {
  slug?: string;
  postId: number;
  content: string;
  parentId?: number;
}) {
  return request<{ ok: true; comment: { id: number; postId: number } }>(
    `/api/boards/${input.slug ?? 'free'}/posts/${input.postId}/comments`,
    {
      method: 'POST',
      body: { content: input.content, parentId: input.parentId },
    },
  );
}
