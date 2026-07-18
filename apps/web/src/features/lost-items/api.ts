import type { LostItemDetail, LostItemSummary } from '@jshsus/types';
import { request } from '../../shared/api/http';

export function getLostItems() {
  return request<LostItemSummary[]>('/api/lost-items');
}

export function getLostItem(id: number) {
  return request<LostItemDetail>(`/api/lost-items/${id}`);
}

export function createLostItem(input: {
  type: 'lost' | 'found';
  itemName: string;
  location: string;
  occurredAt?: string;
  description: string;
}) {
  return request<{ ok: true; lostItem: { id: number; status: 'PROCESSING' } }>('/api/lost-items', {
    method: 'POST',
    body: input,
  });
}

export function updateLostItem(
  id: number,
  input: {
    type: 'lost' | 'found';
    itemName: string;
    location: string;
    occurredAt?: string;
    description: string;
  },
) {
  return request<{ ok: true; id: number }>(`/api/lost-items/${id}`, {
    method: 'PUT',
    body: input,
  });
}

export function updateLostItemStatus(id: number, status: LostItemSummary['status']) {
  return request<{ ok: true; id: number; status: LostItemSummary['status'] }>(
    `/api/lost-items/${id}/status`,
    { method: 'PUT', body: { status } },
  );
}

export function discardLostItem(id: number) {
  return request<{ ok: true; id: number }>(`/api/lost-items/${id}`, {
    method: 'DELETE',
  });
}
