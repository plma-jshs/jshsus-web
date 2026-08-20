import { request } from '../../shared/api/http';
import type {
  MyWakeSongRequests,
  WakeSongPreview,
  WakeSongRequestInput,
  WakeSongRequestStatus,
} from './types';

export function previewWakeSong(url: string) {
  const search = new URLSearchParams({ url });
  return request<WakeSongPreview>(`/api/wake-songs/preview?${search.toString()}`);
}

export function getMyWakeSongRequests() {
  return request<MyWakeSongRequests>('/api/wake-songs/me');
}

export function createWakeSongRequest(input: WakeSongRequestInput) {
  return request<{ ok: true; id: number; status: 'PENDING' }>('/api/wake-songs', {
    method: 'POST',
    body: input,
  });
}

export function updateWakeSongRequest(id: number, input: WakeSongRequestInput) {
  return request<{ ok: true; id: number; status: 'PENDING' }>(`/api/wake-songs/${id}`, {
    method: 'PUT',
    body: input,
  });
}

export function cancelWakeSongRequest(id: number) {
  return request<{ ok: true; id: number; status: WakeSongRequestStatus }>(
    `/api/wake-songs/${id}/cancel`,
    { method: 'POST' },
  );
}
