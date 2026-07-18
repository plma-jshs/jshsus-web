// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NotificationItem, NotificationListResponse } from '@jshsus/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationMenuView } from './NotificationMenu';

afterEach(cleanup);

const notifications: NotificationItem[] = [
  {
    id: 1,
    type: 'point_awarded',
    title: '새로운 상점(+3점)이 부여되었습니다.',
    body: '사유: 급식실 질서 지도',
    link: '/points',
    metadata: { point: 3 },
    isRead: false,
    createdAt: '2026-07-17T09:00:00+09:00',
    expiresAt: '2026-07-24T09:00:00+09:00',
  },
  {
    id: 2,
    type: 'activity_request_approved',
    title: "'생명과학실' 탐구활동서가 승인되었습니다.",
    link: '/activity-requests/2',
    isRead: true,
    readAt: '2026-07-16T10:10:00+09:00',
    createdAt: '2026-07-16T10:00:00+09:00',
    expiresAt: '2026-07-23T10:00:00+09:00',
  },
];

function renderMenu(
  data: NotificationListResponse = { items: notifications, unreadCount: 1 },
  overrides: Partial<React.ComponentProps<typeof NotificationMenuView>> = {},
) {
  const props: React.ComponentProps<typeof NotificationMenuView> = {
    data,
    isLoading: false,
    isError: false,
    isMarkingAll: false,
    onRetry: vi.fn(),
    onMarkAllRead: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
  render(<NotificationMenuView {...props} />);
  return props;
}

describe('NotificationMenuView', () => {
  it('shows the unread badge and renders newest unread notifications first', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole('button', { name: '알림, 읽지 않은 알림 1개' });
    expect(trigger).toHaveTextContent('1');
    await user.click(trigger);

    const list = screen.getByRole('list', { name: '최근 알림' });
    const items = within(list).getAllByRole('button');
    expect(items[0]).toHaveTextContent('새로운 상점(+3점)이 부여되었습니다.');
    expect(items[0]).toHaveClass('is-unread');
    expect(items[1]).toHaveTextContent("'생명과학실' 탐구활동서가 승인되었습니다.");
    expect(items[1]).toHaveClass('is-read');
  });

  it('marks one or every notification read and only passes safe internal links', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onMarkAllRead = vi.fn();
    renderMenu(undefined, { onSelect, onMarkAllRead });

    await user.click(screen.getByRole('button', { name: /읽지 않은 알림 1개/ }));
    await user.click(screen.getByRole('button', { name: '모두 읽음으로 표시' }));
    expect(onMarkAllRead).toHaveBeenCalledOnce();

    await user.click(
      screen.getByRole('button', {
        name: '새로운 상점(+3점)이 부여되었습니다., 읽지 않음',
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(notifications[0], '/points');
  });

  it('never navigates to an external or protocol-relative notification link', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const unsafe = {
      ...notifications[0],
      link: '//evil.example/steal',
    } satisfies NotificationItem;
    renderMenu({ items: [unsafe], unreadCount: 1 }, { onSelect });

    await user.click(screen.getByRole('button', { name: /읽지 않은 알림 1개/ }));
    await user.click(
      screen.getByRole('button', {
        name: '새로운 상점(+3점)이 부여되었습니다., 읽지 않음',
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(unsafe, null);
  });

  it('closes on Escape and restores focus to the bell button', async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole('button', { name: /알림, 읽지 않은/ });

    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: '알림' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: '알림' })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('renders loading, failure and empty states without exposing stale list content', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(
      <NotificationMenuView
        isLoading
        isError={false}
        isMarkingAll={false}
        onRetry={onRetry}
        onMarkAllRead={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '알림' }));
    expect(screen.getByRole('status')).toHaveTextContent('알림을 불러오는 중입니다.');

    rerender(
      <NotificationMenuView
        isLoading={false}
        isError
        isMarkingAll={false}
        onRetry={onRetry}
        onMarkAllRead={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(
      <NotificationMenuView
        data={{ items: [], unreadCount: 0 }}
        isLoading={false}
        isError={false}
        isMarkingAll={false}
        onRetry={onRetry}
        onMarkAllRead={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('새로운 알림이 없습니다.')).toBeInTheDocument();
  });

  it('caps large unread counts at 99+', async () => {
    const user = userEvent.setup();
    renderMenu({ items: notifications, unreadCount: 135 });
    const trigger = screen.getByRole('button', { name: '알림, 읽지 않은 알림 135개' });
    expect(trigger).toHaveTextContent('99+');
    await user.click(trigger);
  });
});
