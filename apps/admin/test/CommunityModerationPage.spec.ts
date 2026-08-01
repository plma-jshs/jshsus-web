import { describe, expect, it } from 'vitest';
import type { BoardPostSummary } from '@jshsus/types';
import { filterCommunityPosts } from '../src/features/content/CommunityModerationPage';

const posts: BoardPostSummary[] = [
  {
    id: 1,
    publicNumber: 1,
    boardSlug: 'free',
    title: '공개 글',
    content: '본문',
    authorName: '작성자',
    isAnonymous: false,
    isHidden: false,
    status: 'published',
    viewCount: 0,
    commentCount: 0,
    createdAt: '2026-08-02T00:00:00.000Z',
  },
  {
    id: 2,
    publicNumber: 2,
    boardSlug: 'free',
    title: '숨긴 글',
    content: '본문',
    authorName: '관리자',
    isAnonymous: false,
    isHidden: true,
    status: 'published',
    viewCount: 0,
    commentCount: 0,
    createdAt: '2026-08-02T00:00:00.000Z',
  },
  {
    id: 3,
    publicNumber: 3,
    boardSlug: 'free',
    title: '업로드 중인 글',
    content: '',
    authorName: '작성자',
    isAnonymous: false,
    isHidden: false,
    status: 'draft',
    viewCount: 0,
    commentCount: 0,
    createdAt: '2026-08-02T00:00:00.000Z',
  },
];

describe('community moderation post filtering', () => {
  it('never exposes internal upload drafts in the moderation list', () => {
    expect(filterCommunityPosts(posts, 'all', '').map((post) => post.id)).toEqual([1, 2]);
  });

  it('keeps published and hidden filters separate while searching visible records', () => {
    expect(filterCommunityPosts(posts, 'published', '').map((post) => post.id)).toEqual([1]);
    expect(filterCommunityPosts(posts, 'hidden', '관리자').map((post) => post.id)).toEqual([2]);
  });
});
