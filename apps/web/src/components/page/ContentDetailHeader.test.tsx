// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../feedback/Toast';
import { ContentDetailHeader } from './ContentDetailHeader';

afterEach(cleanup);

describe('ContentDetailHeader', () => {
  it('uses the article title as the page heading', () => {
    const view = render(
      <ToastProvider>
        <ContentDetailHeader
          title="게시글 제목"
          author="작성자"
          authorProfileImageUrl="/api/files/12/content"
          createdAt="2026-07-16T09:00:00+09:00"
        />
      </ToastProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: '게시글 제목' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(
      view.container.querySelector('.content-detail-header__author .user-avatar img'),
    ).toHaveAttribute('src', '/api/files/12/content');
  });

  it('shows the shared default avatar when the author has no profile image', () => {
    const view = render(
      <ToastProvider>
        <ContentDetailHeader
          title="프로필 없는 글"
          author="작성자"
          createdAt="2026-07-16T09:00:00+09:00"
        />
      </ToastProvider>,
    );

    expect(
      view.container.querySelector('.content-detail-header__author .user-avatar img'),
    ).toHaveAttribute('src', '/assets/default-avatar.png');
  });

  it('can omit the author avatar for institutional content', () => {
    const view = render(
      <ToastProvider>
        <ContentDetailHeader
          title="공지"
          author="학생부"
          showAuthorAvatar={false}
          createdAt="2026-07-16T09:00:00+09:00"
        />
      </ToastProvider>,
    );

    expect(view.container.querySelector('.content-detail-header__author .user-avatar')).toBeNull();
  });
});
