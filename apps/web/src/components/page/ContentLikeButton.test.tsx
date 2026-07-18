// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentLikeButton } from './ContentLikeButton';

afterEach(cleanup);

describe('ContentLikeButton', () => {
  it('exposes the current state and count to assistive technology', () => {
    render(<ContentLikeButton liked likeCount={7} onClick={() => undefined} />);

    const button = screen.getByRole('button', { name: '좋아요 취소, 현재 7개' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('좋아요');
    expect(button).toHaveTextContent('7');
  });

  it('keeps the heart wrapper in compact mode while hiding only the text label', () => {
    const { container } = render(
      <ContentLikeButton compact liked={false} likeCount={2} onClick={() => undefined} />,
    );

    expect(container.querySelector('.content-like-button__heart')).toBeInTheDocument();
    expect(
      container.querySelector(
        '.content-like-button.is-compact > span:not(.content-like-button__heart)',
      ),
    ).toHaveTextContent('좋아요');
  });

  it('runs the supplied toggle action', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<ContentLikeButton liked={false} likeCount={2} onClick={onClick} />);

    const button = screen.getByRole('button', { name: '좋아요, 현재 2개' });
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(button.querySelector('.content-like-button__heart')).toHaveClass('is-pulsing');
  });
});
