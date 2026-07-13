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
  return request<{ ok: true; lostItem: { id: number; status: 'open' } }>('/api/lost-items', {
    method: 'POST',
    body: input,
  });
}

export function discardLostItem(id: number) {
  return request<{ ok: true; id: number }>(`/api/lost-items/${id}`, { method: 'DELETE' });
}
