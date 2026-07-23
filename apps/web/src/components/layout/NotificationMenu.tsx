import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import type { NotificationItem, NotificationListResponse } from '@jshsus/types';
import {
  Award,
  Bell,
  BellRing,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../features/notifications/api';
import { formatKoreanRelativeTime } from '../../shared/lib/date';
import { safeInternalReturnTo } from '../../shared/lib/route';

export const notificationsQueryKey = ['notifications'] as const;

type NotificationMenuViewProps = {
  data?: NotificationListResponse;
  isLoading: boolean;
  isError: boolean;
  isMarkingAll: boolean;
  onRetry: () => void;
  onMarkAllRead: () => void;
  onSelect: (notification: NotificationItem, safeHref: string | null) => void;
};

function resolveNotificationHref(value: string | undefined, origin: string) {
  if (!value) return null;
  return safeInternalReturnTo(value, origin) === value ? value : null;
}

function notificationTone(notification: NotificationItem) {
  if (notification.type !== 'point_awarded') return notification.type;
  const score = Number(
    notification.metadata?.point ??
      notification.metadata?.score ??
      notification.metadata?.points ??
      0,
  );
  return score < 0 ? 'point-penalty' : 'point-merit';
}

function NotificationTypeIcon({ notification }: { notification: NotificationItem }) {
  const tone = notificationTone(notification);
  const icon = (() => {
    if (tone === 'point-merit' || tone === 'point-penalty') return <Award size={18} />;
    if (tone === 'activity_request_submitted') return <ClipboardCheck size={18} />;
    if (tone === 'activity_request_approved') return <CircleCheck size={18} />;
    return <CircleX size={18} />;
  })();

  return (
    <span className={`notification-item__icon is-${tone}`} aria-hidden="true">
      {icon}
    </span>
  );
}

function NotificationTitle({ title }: { title: string }) {
  const activitySubmittedMatch = /^(.*?) 님이 새로운 탐구활동서를 제출했습니다\.$/.exec(title);
  if (activitySubmittedMatch) {
    return (
      <span className="notification-item__title">
        <strong>{activitySubmittedMatch[1]}</strong>
        <span> 님이 새로운 </span>
        <strong>탐구활동서</strong>
        <span>를 제출했습니다.</span>
      </span>
    );
  }

  return <strong className="notification-item__title">{title}</strong>;
}

function NotificationListState({
  isLoading,
  isError,
  onRetry,
}: Pick<NotificationMenuViewProps, 'isLoading' | 'isError' | 'onRetry'>) {
  if (isLoading) {
    return (
      <div className="notification-popover__state" role="status">
        <RefreshCw className="notification-popover__spinner" aria-hidden="true" size={20} />
        알림을 불러오는 중입니다.
      </div>
    );
  }

  if (isError) {
    return (
      <div className="notification-popover__state" role="alert">
        <span>알림을 불러오지 못했습니다.</span>
        <button type="button" onClick={onRetry}>
          다시 시도
        </button>
      </div>
    );
  }

  return null;
}

export function NotificationMenuView({
  data,
  isLoading,
  isError,
  isMarkingAll,
  onRetry,
  onMarkAllRead,
  onSelect,
}: NotificationMenuViewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const unreadCount = data?.unreadCount ?? 0;
  const notifications = useMemo(
    () =>
      [...(data?.items ?? [])].sort(
        (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
      ),
    [data?.items],
  );

  const closeAndRestoreFocus = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeAndRestoreFocus();
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [closeAndRestoreFocus, isOpen]);

  return (
    <div className="header-notification-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        className="header-notification-trigger"
        type="button"
        aria-label={`알림${unreadCount > 0 ? `, 읽지 않은 알림 ${unreadCount}개` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="header-notification-popover"
        onClick={() => setIsOpen((current) => !current)}
      >
        {unreadCount > 0 ? (
          <BellRing aria-hidden="true" size={19} />
        ) : (
          <Bell aria-hidden="true" size={19} />
        )}
        {unreadCount > 0 ? (
          <span
            className={`header-notification-badge${unreadCount > 9 ? ' is-wide' : ''}`}
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <section
          id="header-notification-popover"
          className="notification-popover"
          role="dialog"
          aria-label="알림"
        >
          <header className="notification-popover__header">
            <strong>알림</strong>
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={unreadCount === 0 || isMarkingAll}
            >
              {isMarkingAll ? '처리 중' : '모두 읽음으로 표시'}
            </button>
          </header>

          <NotificationListState isLoading={isLoading} isError={isError} onRetry={onRetry} />

          {!isLoading && !isError && notifications.length === 0 ? (
            <div className="notification-popover__empty">
              <Bell aria-hidden="true" size={22} />
              <span>새로운 알림이 없습니다.</span>
            </div>
          ) : null}

          {!isLoading && !isError && notifications.length > 0 ? (
            <ul className="notification-list" aria-label="최근 알림">
              {notifications.map((notification) => {
                const safeHref = resolveNotificationHref(notification.link, window.location.origin);
                return (
                  <li key={notification.id}>
                    <button
                      className={`notification-item${notification.isRead ? ' is-read' : ' is-unread'}`}
                      type="button"
                      aria-label={`${notification.title}${notification.isRead ? '' : ', 읽지 않음'}`}
                      onClick={() => {
                        onSelect(notification, safeHref);
                        if (safeHref) setIsOpen(false);
                      }}
                    >
                      <NotificationTypeIcon notification={notification} />
                      <span className="notification-item__content">
                        <NotificationTitle title={notification.title} />
                        {notification.body ? (
                          <span className="notification-item__body">{notification.body}</span>
                        ) : null}
                        <time dateTime={notification.createdAt}>
                          {formatKoreanRelativeTime(notification.createdAt)}
                        </time>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function markOneRead(
  current: NotificationListResponse | undefined,
  notificationId: number,
): NotificationListResponse | undefined {
  if (!current) return current;
  const target = current.items.find((item) => item.id === notificationId);
  if (!target || target.isRead) return current;

  return {
    ...current,
    unreadCount: Math.max(0, current.unreadCount - 1),
    items: current.items.map((item) =>
      item.id === notificationId
        ? { ...item, isRead: true, readAt: new Date().toISOString() }
        : item,
    ),
  };
}

function markEveryItemRead(
  current: NotificationListResponse | undefined,
): NotificationListResponse | undefined {
  if (!current || current.unreadCount === 0) return current;
  const readAt = new Date().toISOString();
  return {
    ...current,
    unreadCount: 0,
    items: current.items.map((item) => (item.isRead ? item : { ...item, isRead: true, readAt })),
  };
}

export function NotificationMenu() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: getNotifications,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const readMutation = useMutation({
    mutationFn: markNotificationRead,
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: notificationsQueryKey });
      const previous = queryClient.getQueryData<NotificationListResponse>(notificationsQueryKey);
      queryClient.setQueryData<NotificationListResponse>(
        notificationsQueryKey,
        (current) => markOneRead(current, notificationId) ?? current,
      );
      return { previous };
    },
    onError: (_error, _notificationId, context) => {
      if (context?.previous) queryClient.setQueryData(notificationsQueryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationsQueryKey }),
  });
  const readAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationsQueryKey });
      const previous = queryClient.getQueryData<NotificationListResponse>(notificationsQueryKey);
      queryClient.setQueryData<NotificationListResponse>(
        notificationsQueryKey,
        (current) => markEveryItemRead(current) ?? current,
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(notificationsQueryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationsQueryKey }),
  });

  return (
    <NotificationMenuView
      data={notificationsQuery.data}
      isLoading={notificationsQuery.isLoading}
      isError={notificationsQuery.isError}
      isMarkingAll={readAllMutation.isPending}
      onRetry={() => void notificationsQuery.refetch()}
      onMarkAllRead={() => readAllMutation.mutate()}
      onSelect={(notification, safeHref) => {
        if (!notification.isRead) readMutation.mutate(notification.id);
        if (safeHref) router.history.push(safeHref);
      }}
    />
  );
}
