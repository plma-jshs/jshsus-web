import type {
  BoardCommentSummary,
  ActivityRequestSummary,
  BoardPostSummary,
  ContentReportSummary,
  HomeDashboard,
  LostItemSummary,
  NoticeSummary,
  PetitionSummary,
  SessionUser,
  StudentSelfStatus,
  UploadedFileSummary,
} from '@jshsus/types';

let csrfTokenCache: string | null = null;

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
};

async function getCsrfToken() {
  if (csrfTokenCache) {
    return csrfTokenCache;
  }

  const response = await fetch('/api/auth/csrf', {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`CSRF request failed: ${response.status}`);
  }

  const data = (await response.json()) as { csrfToken: string };
  csrfTokenCache = data.csrfToken;
  return csrfTokenCache;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: HeadersInit = {
    accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  if (method !== 'GET' && path !== '/api/auth/login') {
    headers['x-csrf-token'] = await getCsrfToken();
  }

  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'x-csrf-token': await getCsrfToken(),
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getHomeDashboard() {
  return request<HomeDashboard>('/api/home');
}

export function getSession() {
  return request<SessionUser>('/api/auth/session');
}

export function login(input: { username: string; password: string }) {
  return request<Extract<SessionUser, { isLogined: true }>>('/api/auth/login', {
    method: 'POST',
    body: input,
  }).then((session) => {
    csrfTokenCache = null;
    return session;
  });
}

export function logout() {
  return request<{ ok: true }>('/api/auth/logout', { method: 'POST' }).then((result) => {
    csrfTokenCache = null;
    return result;
  });
}

export function getMyStatus() {
  return request<StudentSelfStatus>('/api/me/status');
}

export function getMyActivityRequests() {
  return request<ActivityRequestSummary[]>('/api/activity-requests/me');
}

export function createActivityRequest(input: {
  location: string;
  startsAt: string;
  endsAt: string;
  purpose: string;
}) {
  return request<{ ok: true; request: { id: number; status: 'submitted' } }>(
    '/api/activity-requests',
    {
      method: 'POST',
      body: input,
    },
  );
}

export function cancelActivityRequest(id: number) {
  return request<{ ok: true; id: number; status: 'canceled' }>(
    `/api/activity-requests/${id}/cancel`,
    {
      method: 'POST',
    },
  );
}

export function getPetitions() {
  return request<PetitionSummary[]>('/api/petitions');
}

export function getNotices() {
  return request<NoticeSummary[]>('/api/notices');
}

export function getBoardPosts(slug = 'free') {
  return request<BoardPostSummary[]>(`/api/boards/${slug}/posts`);
}

export function getBoardComments(slug: string, postId: number) {
  return request<BoardCommentSummary[]>(`/api/boards/${slug}/posts/${postId}/comments`);
}

export function createBoardPost(input: {
  slug?: string;
  title: string;
  content: string;
  isAnonymous: boolean;
}) {
  return request<{ ok: true; post: { id: number; boardSlug: string } }>(
    `/api/boards/${input.slug ?? 'free'}/posts`,
    {
      method: 'POST',
      body: {
        title: input.title,
        content: input.content,
        isAnonymous: input.isAnonymous,
      },
    },
  );
}

export function createBoardComment(input: {
  slug?: string;
  postId: number;
  content: string;
  parentId?: number;
}) {
  return request<{ ok: true; comment: { id: number; postId: number } }>(
    `/api/boards/${input.slug ?? 'free'}/posts/${input.postId}/comments`,
    {
      method: 'POST',
      body: {
        content: input.content,
        parentId: input.parentId,
      },
    },
  );
}

export function createContentReport(input: {
  targetType: ContentReportSummary['targetType'];
  targetId: number;
  reason: string;
  detail?: string;
}) {
  return request<{ ok: true; report: { id: number } }>('/api/reports', {
    method: 'POST',
    body: input,
  });
}

export function getLostItems() {
  return request<LostItemSummary[]>('/api/lost-items');
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

export async function uploadFile(input: {
  file: File;
  targetType: string;
  targetId: number;
  visibility?: UploadedFileSummary['visibility'];
}) {
  const formData = new FormData();
  formData.set('file', input.file);
  formData.set('targetType', input.targetType);
  formData.set('targetId', String(input.targetId));
  formData.set('visibility', input.visibility ?? 'private');
  return uploadRequest<{ ok: true; file: UploadedFileSummary }>('/api/files', formData);
}

export function createPetition(input: { title: string; content: string; endsAt: string }) {
  return request<{ ok: true; petition: { id: number; status: 'open' } }>('/api/petitions', {
    method: 'POST',
    body: input,
  });
}

export function participatePetition(id: number) {
  return request<{ ok: true; id: number; participated: boolean; participantCount?: number }>(
    `/api/petitions/${id}/participate`,
    { method: 'POST' },
  );
}
