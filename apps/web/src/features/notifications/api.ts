import type { NotificationListResponse } from '@jshsus/types';
import { request } from '../../shared/api/http';

export function getNotifications() {
  return request<NotificationListResponse>('/api/notifications');
}

export function markNotificationRead(id: number) {
  return request<{ ok: true }>(`/api/notifications/${id}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead() {
  return request<{ ok: true }>('/api/notifications/read-all', { method: 'PATCH' });
}
