import type { WakeSongPage, WakeSongRequestStatus } from './types';

let csrfTokenCache: string | null = null;

async function csrfToken() {
  if (csrfTokenCache) return csrfTokenCache;
  const response = await fetch('/api/auth/csrf', {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error('CSRF token request failed');
  const payload = (await response.json()) as { csrfToken: string };
  csrfTokenCache = payload.csrfToken;
  return csrfTokenCache;
}

async function request<T>(path: string, body?: unknown, method?: 'POST' | 'PUT'): Promise<T> {
  const requestMethod = method ?? (body === undefined ? 'GET' : 'POST');
  const response = await fetch(path, {
    method: requestMethod,
    credentials: 'include',
    headers:
      body === undefined
        ? { accept: 'application/json' }
        : {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-csrf-token': await csrfToken(),
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Wake-song request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export const wakeSongAdminApi = {
  list: (input: {
    status?: WakeSongRequestStatus;
    query?: string;
    page: number;
    pageSize?: number;
    weekStart?: string;
    sortBy?: 'status' | 'requester' | 'videoTitle' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
  }) => {
    const search = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize ?? 20),
    });
    if (input.status) search.set('status', input.status);
    if (input.query) search.set('query', input.query);
    if (input.sortBy) search.set('sortBy', input.sortBy);
    if (input.sortOrder) search.set('sortOrder', input.sortOrder);
    if (input.weekStart) search.set('weekStart', input.weekStart);
    return request<WakeSongPage>(`/api/admin/wake-songs?${search.toString()}`);
  },
  approve: (id: number) =>
    request<{ ok: true; id: number; status: 'APPROVED' }>(
      `/api/admin/wake-songs/${id}/approve`,
      {},
    ),
  reject: (id: number, reason: string) =>
    request<{ ok: true; id: number; status: 'REJECTED' }>(`/api/admin/wake-songs/${id}/reject`, {
      reason,
    }),
  update: (
    id: number,
    input: {
      url: string;
      startSeconds: number;
      endSeconds: number;
      playbackRate: number;
      requestNote: string;
    },
  ) =>
    request<{ ok: true; id: number; status: WakeSongRequestStatus }>(
      `/api/admin/wake-songs/${id}`,
      input,
      'PUT',
    ),
  schedule: (id: number, scheduledAt: string) =>
    request<{ ok: true; id: number; status: 'SCHEDULED' }>(`/api/admin/wake-songs/${id}/schedule`, {
      scheduledAt,
    }),
  markPlayed: (id: number) =>
    request<{ ok: true; id: number; status: 'PLAYED' }>(`/api/admin/wake-songs/${id}/played`, {}),
  generateAudio: (id: number) =>
    request<{
      ok: true;
      id: number;
      audio: {
        status: 'READY';
        fileId: number;
        downloadUrl: string;
        sizeBytes: number;
        generatedAt: string;
      };
    }>(`/api/admin/wake-songs/${id}/audio`, {}),
};
