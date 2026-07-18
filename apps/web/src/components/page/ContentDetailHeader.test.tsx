// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContentDetailHeader } from './ContentDetailHeader';

afterEach(cleanup);

describe('ContentDetailHeader', () => {
  it('uses the article title as the page heading', () => {
    render(
      <ContentDetailHeader
        title="게시글 제목"
        author="작성자"
        createdAt="2026-07-16T09:00:00+09:00"
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: '게시글 제목' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });
});
